// tests/unit/sync.spec.ts — Tests d'intégration du job de synchronisation
// (ticket 008, spec §9.6, ADR-0003, ADR-0004). Base SQLite temporaire +
// provider simulé (chaîne de repli). Scénarios : run à vide, upsert nouvelle
// station + mise à jour même jour, append quotidien (2 jours → 2 lignes),
// échec partiel simulé → données intactes, purge 48 h.
import { describe, expect, it, afterEach } from 'vitest'
import { createTestDb } from '../helpers/db'
import { createDb } from '../../server/db/client'
import { createSyncPricesJob, OBSOLETE_AFTER_HOURS } from '../../server/jobs/syncPrices'
import { createStationsRepository } from '../../server/repositories/stations'
import { createPricesRepository } from '../../server/repositories/prices'
import { createPriceHistoryRepository } from '../../server/repositories/priceHistory'
import type { FuelPriceProvider, ProviderResult, StationMetadataProvider, StationMetadata } from '../../server/providers/types'
import type { StationPrice, FuelType } from '../../domain/fuel-prices/types'

// ——— Provider simulé : retourne un état par appel, indexé par fuel ———
// Représente la chaîne de repli (ADR-0003) : un même provider retourne un
// résultat par carburant, et peut simuler l'échec d'un carburant (un appel
// qui échoue → la chaîne garde les données existantes, retentative au tick
// suivant).
function makeStation(
  id: string,
  fuel: FuelType,
  overrides: Partial<StationPrice> = {}
): StationPrice {
  return {
    id,
    name: id,
    brand: null,
    address: `${id} address`,
    city: 'PARIS',
    postalCode: '75001',
    position: { lat: 48.861, lon: 2.341 },
    fuel,
    price: 2.0,
    updatedAt: new Date('2026-08-03T09:00:00Z'),
    ...overrides
  }
}

interface SimulatedState {
  [fuel: string]: StationPrice[] | undefined
}

function makeProvider(state: SimulatedState, failFuels: FuelType[] = []): FuelPriceProvider {
  return {
    name: 'simulated',
    async findNearbyStations({ fuel }): Promise<ProviderResult> {
      if (failFuels.includes(fuel)) {
        throw new Error(`Simulation : source indisponible pour ${fuel}`)
      }
      return {
        stations: state[fuel] ?? [],
        source: 'opendatasoft-api',
        syncedAt: new Date()
      }
    }
  }
}

// ——— Provider de métadonnées simulé (ticket 019) ———
// Le job enrichit les stations après l'upsert : OSM d'abord, repli dérivation
// adresse (017), sinon nom par défaut = id. Chaque test choisit sa résolution.
// Le « noop » (aucun enrichissement) préserve le comportement historique du job
// (ticket 008) : nom = id, brand = null.
function makeNoopMetadataProvider(): StationMetadataProvider {
  return { name: 'osm-metadata', sourceName: 'OpenStreetMap (ODbL)', findMetadataFor: async () => [] }
}

function makeMetadataProvider(metas: StationMetadata[]): StationMetadataProvider {
  return { name: 'osm-metadata', sourceName: 'OpenStreetMap (ODbL)', findMetadataFor: async () => metas }
}

// Provider OSM qui échoue (source indisponible) : le job doit rester tolérant
// (repli dérivation adresse / nom par défaut), jamais planter.
function makeFailingMetadataProvider(): StationMetadataProvider {
  return {
    name: 'osm-metadata',
    sourceName: 'OpenStreetMap (ODbL)',
    findMetadataFor: async () => {
      throw new Error('Simulation : Overpass indisponible')
    }
  }
}

let dbHandle: ReturnType<typeof createTestDb> | undefined

afterEach(() => {
  dbHandle?.close()
  dbHandle = undefined
})

function setup() {
  dbHandle = createTestDb()
  return dbHandle
}

describe('job de synchronisation (ticket 008)', () => {
  it('run à vide : aucun prix reçu → rien n\'est écrit, la base reste cohérente', async () => {
    const { db } = setup()
    const provider = makeProvider({})
    const job = createSyncPricesJob({ db, provider, metadataProvider: makeNoopMetadataProvider() })

    // La source est joignable mais ne renvoie aucun prix : aucune écriture,
    // résultat « vide » explicite, pas de crash.
    const result = await job.run()
    expect(result.stationsSynced).toBe(0)
    expect(result.pricesSynced).toBe(0)
    expect(result.historyAppended).toBe(0)

    // La base reste vide : aucune station, aucun prix, aucun historique.
    const stationsRepo = createStationsRepository(db)
    const pricesRepo = createPricesRepository(db)
    const historyRepo = createPriceHistoryRepository(db)
    expect(await stationsRepo.count()).toBe(0)
    expect(await pricesRepo.count()).toBe(0)
    expect(await historyRepo.count()).toBe(0)
  })

  it('échec total : aucune source pour aucun fuel → erreur explicite, base intacte', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    const allFail = makeProvider({}, ['Gazole', 'SP95', 'SP98', 'E10', 'E85', 'GPLc'])
    const job = createSyncPricesJob({ db, provider: allFail, now: () => now, today, metadataProvider: makeNoopMetadataProvider() })

    await expect(job.run()).rejects.toThrow(/Aucune source disponible/)

    const stationsRepo = createStationsRepository(db)
    const pricesRepo = createPricesRepository(db)
    const historyRepo = createPriceHistoryRepository(db)
    expect(await stationsRepo.count()).toBe(0)
    expect(await pricesRepo.count()).toBe(0)
    expect(await historyRepo.count()).toBe(0)
  })

  it('upsert : nouvelle station + mise à jour le même jour (1 seule ligne history)', async () => {
    const { db } = setup()
    const day = '2026-08-03'
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date(day + 'T00:00:00Z')
    const state: SimulatedState = { Gazole: [makeStation('1', 'Gazole', { price: 2.1 })] }

    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })

    const first = await job.run()
    expect(first.stationsSynced).toBe(1)
    expect(first.pricesSynced).toBe(1)
    expect(first.historyAppended).toBe(1)

    // Même jour, nouveau prix → upsert prix + upsert history (toujours 1 ligne).
    state.Gazole = [{ ...makeStation('1', 'Gazole', { price: 2.0 }), updatedAt: new Date('2026-08-03T14:00:00Z') }]
    const second = await job.run()
    expect(second.stationsSynced).toBe(1)
    expect(second.historyAppended).toBe(1)

    const pricesRepo = createPricesRepository(db)
    const historyRepo = createPriceHistoryRepository(db)
    const stationsRepo = createStationsRepository(db)

    expect(await stationsRepo.count()).toBe(1)
    expect(await pricesRepo.count()).toBe(1)
    const gazole = await pricesRepo.findByStationAndFuel('1', 'Gazole')
    expect(gazole?.price).toBe(2.0)
    expect(gazole?.updatedAt).toEqual(new Date('2026-08-03T14:00:00Z'))

    const history = await historyRepo.findByStationAndFuel('1', 'Gazole')
    expect(history).toEqual([{ day, price: 2.0 }])
    expect(await historyRepo.count()).toBe(1)
  })

  it('append quotidien : 2 jours différents → 2 lignes d\'historique', async () => {
    const { db } = setup()
    const state: SimulatedState = { Gazole: [makeStation('2', 'Gazole', { price: 2.0 })] }
    let currentDay = new Date('2026-08-03T10:00:00Z')
    let now = currentDay
    const job = createSyncPricesJob({
      db,
      provider: makeProvider(state),
      now: () => now,
      today: () => currentDay,
      metadataProvider: makeNoopMetadataProvider()
    })

    await job.run()
    // Jour 2 : nouveau prix, autre jour → nouvelle ligne history.
    state.Gazole = [{ ...makeStation('2', 'Gazole', { price: 2.05 }), updatedAt: new Date('2026-08-04T10:00:00Z') }]
    currentDay = new Date('2026-08-04T10:00:00Z')
    now = currentDay
    await job.run()

    const historyRepo = createPriceHistoryRepository(db)
    const history = await historyRepo.findByStationAndFuel('2', 'Gazole')
    expect(history).toEqual([
      { day: '2026-08-03', price: 2.0 },
      { day: '2026-08-04', price: 2.05 }
    ])
    expect(await historyRepo.count()).toBe(2)
  })

  it('échec partiel simulé : un fuel échoue → données intactes, retentative au tick suivant', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    const state: SimulatedState = { Gazole: [makeStation('1', 'Gazole')] }

    // Premier run : tout fonctionne.
    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    await job.run()

    // Deuxième run : E10 échoue (source KO). Gazole continue de fonctionner.
    const failingProvider = makeProvider(state, ['E10'])
    const job2 = createSyncPricesJob({ db, provider: failingProvider, now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    const result = await job2.run()
    expect(result.skippedFuels).toEqual(['E10'])
    // Gazole reste intact et a été resynchronisé.
    expect(result.pricesSynced).toBe(1)

    const pricesRepo = createPricesRepository(db)
    expect(await pricesRepo.count()).toBe(1)
    const gazole = await pricesRepo.findByStationAndFuel('1', 'Gazole')
    expect(gazole?.price).toBe(2.0)

    // Échec de TOUS les fuels → erreur explicite, aucune écriture.
    const allFail = makeProvider(state, ['Gazole', 'SP95', 'SP98', 'E10', 'E85', 'GPLc'])
    const job3 = createSyncPricesJob({ db, provider: allFail, now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    await expect(job3.run()).rejects.toThrow(/Aucune source disponible/)
    expect(await pricesRepo.count()).toBe(1)
  })

  it('purge 48 h : prix obsolète neutralisé (rupture), encore visible ; prix récent intact', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    const cutoff = new Date(now.getTime() - OBSOLETE_AFTER_HOURS * 3_600_000)

    // Deux stations Gazole : une récente (2 h), une obsolète (72 h).
    const state: SimulatedState = {
      Gazole: [
        makeStation('fresh', 'Gazole', {
          price: 2.0,
          updatedAt: new Date(now.getTime() - 2 * 3_600_000)
        }),
        makeStation('old', 'Gazole', {
          price: 2.5,
          updatedAt: new Date(now.getTime() - 72 * 3_600_000)
        })
      ]
    }
    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    const result = await job.run()
    // La purge neutralise 1 prix obsolète (72 h > 48 h) → rupture=true.
    expect(result.obsoleteNeutralized).toBe(1)

    const pricesRepo = createPricesRepository(db)
    // Les deux restent visibles (jamais supprimées, FRE-3).
    expect(await pricesRepo.count()).toBe(2)
    const fresh = await pricesRepo.findByStationAndFuel('fresh', 'Gazole')
    const old = await pricesRepo.findByStationAndFuel('old', 'Gazole')
    expect(fresh?.rupture).toBe(false)
    expect(old?.rupture).toBe(true)

    // Le prix obsolète reste lisible (donnée conservée, badge géré en lecture).
    expect(old?.price).toBe(2.5)
    expect(old?.updatedAt.getTime()).toBeLessThan(cutoff.getTime())
  })

  it('atomicité : une erreur pendant l\'écriture transactionnelle ne laisse aucune écriture partielle', async () => {
    const { db, sqlite, dbPath } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')

    // Provider qui réussit (données valides). On force une erreur SQL à
    // l'intérieur de la transaction en fermant la connexion sous-jacente :
    // la transaction rollback → aucune station/prix/historique ne subsiste.
    const state: SimulatedState = { Gazole: [makeStation('1', 'Gazole')] }
    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })

    // Fermer la connexion force le prochain accès SQL à échouer → toute la
    // transaction (stations + prices + history) est annulée.
    sqlite.close()
    await expect(job.run()).rejects.toThrow()

    // Ré-ouvrir la base depuis le même chemin : aucune écriture partielle ne
    // doit subsister (la transaction a rollback).
    const { db: reopened } = createDb(dbPath)
    const stationsRepo = createStationsRepository(reopened)
    const pricesRepo = createPricesRepository(reopened)
    const historyRepo = createPriceHistoryRepository(reopened)
    expect(await stationsRepo.count()).toBe(0)
    expect(await pricesRepo.count()).toBe(0)
    expect(await historyRepo.count()).toBe(0)
    reopened.$client.close()
  })
})

describe('enrichissement d\'identité à la synchronisation (ticket 019)', () => {
  it('OSM : applique name, brand, brandWikidataId et logoUrl réels à la station', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    const state: SimulatedState = { Gazole: [makeStation('1000001', 'Gazole')] }

    const metadata = makeMetadataProvider([
      {
        id: '1000001',
        name: 'Carrefour Market Bourg-en-Bresse',
        brand: 'Carrefour Market',
        brandWikidataId: 'Q867662',
        logoUrl: 'https://upload.wikimedia.org/commons/e/ed/logo.svg'
      }
    ])
    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: metadata })
    const result = await job.run()
    expect(result.stationsSynced).toBe(1)
    expect(result.enrichedStations).toBe(1)

    const row = await createStationsRepository(db).findById('1000001')
    expect(row?.name).toBe('Carrefour Market Bourg-en-Bresse')
    expect(row?.brand).toBe('Carrefour Market')
    expect(row?.brandWikidataId).toBe('Q867662')
    expect(row?.logoUrl).toBe('https://upload.wikimedia.org/commons/e/ed/logo.svg')
  })

  it('repli dérivation adresse (017) : station non trouvée par OSM → enseigne réelle', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    // L'adresse porte « INTERMARCHE » : la dérivation (017) reconnaît une
    // enseigne réelle. OSM ne trouve rien.
    const state: SimulatedState = {
      Gazole: [makeStation('7', 'Gazole', { address: 'INTERMARCHE ROUTE DE LYON', city: 'BOURG-EN-BRESSE' })]
    }

    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    await job.run()

    const row = await createStationsRepository(db).findById('7')
    expect(row?.name).toBe('Intermarché')
    expect(row?.brand).toBe('Intermarché')
    expect(row?.brandWikidataId).toBeNull()
    expect(row?.logoUrl).toBeNull()
  })

  it('sans match OSM ni adresse : nom par défaut = id, brand = null (aucun nom fabriqué)', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    const state: SimulatedState = {
      Gazole: [makeStation('123456', 'Gazole', { address: '12 RUE DE LA GARE', city: 'LYON' })]
    }

    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    const result = await job.run()
    // Aucune station enrichie : nom = id, brand = null.
    expect(result.enrichedStations).toBe(0)

    const row = await createStationsRepository(db).findById('123456')
    expect(row?.name).toBe('123456')
    expect(row?.brand).toBeNull()
    expect(row?.brandWikidataId).toBeNull()
    expect(row?.logoUrl).toBeNull()
  })

  it('tolérance : le provider OSM qui échoue ne casse pas le job (repli adresse / id)', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')
    const state: SimulatedState = {
      Gazole: [makeStation('CARREFOUR-1', 'Gazole', { address: 'CARREFOUR 12 RUE DE LA GARE', city: 'LYON' })]
    }

    const job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeFailingMetadataProvider() })
    const result = await job.run()
    // Le job tourne quand même ; la dérivation adresse fournit l'enseigne.
    expect(result.stationsSynced).toBe(1)
    const row = await createStationsRepository(db).findById('CARREFOUR-1')
    expect(row?.name).toBe('Carrefour')
    expect(row?.brand).toBe('Carrefour')
  })

  it('aucune écriture partielle : sans résolution, l\'upsert conserve le nom précédent', async () => {
    const { db } = setup()
    const now = new Date('2026-08-03T12:00:00Z')
    const today = () => new Date('2026-08-03T00:00:00Z')

    // Premier run : OSM fournit un nom réel.
    const withOsm = makeMetadataProvider([
      { id: 'S1', name: 'TotalEnergies Lyon', brand: 'TotalEnergies', brandWikidataId: null, logoUrl: null }
    ])
    const state: SimulatedState = { Gazole: [makeStation('S1', 'Gazole')] }
    let job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: withOsm })
    await job.run()

    // Deuxième run : plus aucun enrichissement (OSM vide). L'upsert doit
    // conserver le nom réel précédent — on ne remplace jamais un nom par null.
    job = createSyncPricesJob({ db, provider: makeProvider(state), now: () => now, today, metadataProvider: makeNoopMetadataProvider() })
    await job.run()

    const row = await createStationsRepository(db).findById('S1')
    expect(row?.name).toBe('TotalEnergies Lyon')
    expect(row?.brand).toBe('TotalEnergies')
  })
})
