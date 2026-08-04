// tests/unit/providers.spec.ts — Tests des providers (ADR-0003, spec §10, §13).
// Fixtures basées sur des records réels vérifiés (docs/research/fuel-data-source.md
// et appels HTTP du 2026-08-03). Aucun prix inventé : chaque fixture est un
// record réel ou une déformation documentée d'un record réel.
import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb } from '../../server/db/client'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createStationsRepository } from '../../server/repositories/stations'
import { createPricesRepository } from '../../server/repositories/prices'
import {
  createOpendatasoftProvider,
  OPENDATASOFT_PAGE_SIZE
} from '../../server/providers/opendatasoft'
import { createJsonExportProvider } from '../../server/providers/jsonExport'
import { createRoulezEcoProvider } from '../../server/providers/roulezoeco'
import { createCacheProvider } from '../../server/providers/cacheProvider'
import { createFallbackChain } from '../../server/providers'
import { normalizeRecord, mapFuelName } from '../../server/providers/normalize'
import type { NearbyStationQuery } from '../../server/providers/types'
import type { StationPrice } from '../../domain/fuel-prices/types'

// ——— Fixtures réelles (vérifiées le 2026-08-03) ———

const QUERY_PARIS: NearbyStationQuery = {
  center: { lat: 48.861, lon: 2.341 }, // Paris 1er (Bailleul)
  radiusKm: 10,
  fuel: 'Gazole'
}

// Record réel API : station 75001003, Paris 1er, Gazole à 2.59 €/L, avec
// rupture E10 (autre carburant), pas de fermeture, geom présente.
const REAL_RECORD_OPENDATASOFT = {
  id: '75001003',
  adresse: '8,10,10bis Rue Bailleul',
  ville: 'PARIS',
  cp: '75001',
  geom: { lon: 2.341, lat: 48.861 },
  prix_nom: 'Gazole',
  prix_valeur: 2.59,
  prix_maj: '2026-06-12T16:35:11+00:00',
  rupture: '{"@id": "5", "@nom": "E10", "@debut": "2012-02-07T15:14:00", "@fin": ""}',
  fermeture: null
}

// Record réel roulez-eco (fichier quotidien 20260802) : station 1000001,
// Bourg-en-Bresse, Gazole 2.291, rupture GPLc (autre carburant).
const REAL_RECORD_ROULEZ = {
  id: '1000001',
  adresse: '596 AVENUE DE TREVOUX',
  ville: 'SAINT-DENIS-lès-BOURG',
  cp: '01000',
  geom: { lon: 5.198, lat: 46.201 },
  prix_nom: 'Gazole',
  prix_valeur: 2.291,
  prix_maj: '2026-08-01T00:41:00+00:00',
  rupture: null,
  fermeture: null
}

// ——— Helpers ———

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function createTestDbHandle() {
  const dir = mkdtempSync(join(tmpdir(), 'jflp-provider-'))
  const dbPath = join(dir, 'test.db')
  const { sqlite, db } = createDb(dbPath)
  migrate(db, { migrationsFolder: 'server/db/migrations' })
  return { sqlite, db, close: () => sqlite.close() }
}

// Mock fetch renvoyant une réponse JSON construite.
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function jsonResponseFromRecords(records: unknown[], total?: number): Response {
  return jsonResponse({ total_count: total ?? records.length, results: records })
}

describe('normalisation (server/providers/normalize.ts)', () => {
  it('mappe les prix_nom officiels vers FuelType (Gazole/SP95/SP98/E10/E85/GPLc)', () => {
    expect(mapFuelName('Gazole')).toBe('Gazole')
    expect(mapFuelName('SP95')).toBe('SP95')
    expect(mapFuelName('SP98')).toBe('SP98')
    expect(mapFuelName('E10')).toBe('E10')
    expect(mapFuelName('SP95-E10')).toBe('E10')
    expect(mapFuelName('E85')).toBe('E85')
    expect(mapFuelName('GPLc')).toBe('GPLc')
    expect(mapFuelName('ESSENCE')).toBeUndefined()
  })

  it('normalise un record API réel (Gazole Gennevilliers/Paris) en StationPrice', () => {
    const s = normalizeRecord(REAL_RECORD_OPENDATASOFT, 'Gazole')
    expect(s).not.toBeNull()
    expect(s!.id).toBe('75001003')
    expect(s!.fuel).toBe('Gazole')
    expect(s!.price).toBe(2.59)
    expect(s!.updatedAt).toEqual(new Date('2026-06-12T16:35:11+00:00'))
    expect(s!.position).toEqual({ lon: 2.341, lat: 48.861 })
    expect(s!.city).toBe('PARIS')
    expect(s!.brand).toBeNull()
  })

  it('normalise un record roulez-eco réel (Gazole Bourg-en-Bresse)', () => {
    const s = normalizeRecord(REAL_RECORD_ROULEZ, 'Gazole')
    expect(s).not.toBeNull()
    expect(s!.price).toBe(2.291)
    expect(s!.updatedAt).toEqual(new Date('2026-08-01T00:41:00+00:00'))
  })

  it('exclut un record en rupture pour CE carburant (rupture @nom = Gazole)', () => {
    const ruptured = {
      ...REAL_RECORD_OPENDATASOFT,
      rupture: '{"@id": "1", "@nom": "Gazole", "@debut": "2026-01-01", "@fin": ""}'
    }
    expect(normalizeRecord(ruptured, 'Gazole')).toBeNull()
  })

  it('ne pas exclure une rupture d’un AUTRE carburant (rupture E10, query Gazole)', () => {
    // Record réel : rupture E10, mais on cherche du Gazole → le prix Gazole
    // reste valide.
    expect(normalizeRecord(REAL_RECORD_OPENDATASOFT, 'Gazole')).not.toBeNull()
  })

  it('exclut une station fermée (fermeture non nul) pour ce carburant', () => {
    const closed = {
      ...REAL_RECORD_OPENDATASOFT,
      fermeture: '{"@type": "T", "@debut": "2026-01-01", "@fin": ""}'
    }
    expect(normalizeRecord(closed, 'Gazole')).toBeNull()
  })

  it('exclut un record sans prix (prix_* null) — geom peut être null', () => {
    // Record réel API : premier record du dataset, geom null ET prix null.
    const noPrice = {
      id: '1200004',
      adresse: '79 RUE DE LA REPUBLIQUE',
      ville: 'BELLEGARDE',
      cp: '01200',
      geom: null,
      prix_nom: null,
      prix_valeur: null,
      prix_maj: null,
      rupture: null,
      fermeture: '{"@type": "T", "@debut": "2009-02-01T00:00:00", "@fin": ""}'
    }
    expect(normalizeRecord(noPrice, 'Gazole')).toBeNull()
  })

  it('exclut un record avec geom null mais prix — jamais un geom inventé', () => {
    const noGeom = {
      ...REAL_RECORD_OPENDATASOFT,
      geom: null
    }
    expect(normalizeRecord(noGeom, 'Gazole')).toBeNull()
  })

  it('exclut un prix aberrant (hors intervalle documenté) sans inventer', () => {
    const absurd = { ...REAL_RECORD_OPENDATASOFT, prix_valeur: 99.99 }
    expect(normalizeRecord(absurd, 'Gazole')).toBeNull()
  })

  it('normalise prix_valeur en chaîne (CSV = chaîne) en nombre', () => {
    const csv = { ...REAL_RECORD_OPENDATASOFT, prix_valeur: '2,185' }
    const s = normalizeRecord(csv, 'Gazole')
    expect(s!.price).toBe(2.185)
  })
})

describe('provider Opendatasoft (priorité 1)', () => {
  it('construit l\'URL avec within_distance (syntaxe réelle vérifiée)', () => {
    // On vérifie la forme de l'URL via un appel mocké.
    let capturedUrl = ''
    const mockFetch: MockFetch = async (input) => {
      capturedUrl = String(input)
      return jsonResponseFromRecords([])
    }
    const p = createOpendatasoftProvider({ fetchFn: mockFetch })
    return p.findNearbyStations(QUERY_PARIS).then(() => {
      const u = new URL(capturedUrl)
      expect(u.origin).toBe('https://data.economie.gouv.fr')
      expect(u.pathname).toContain('/records')
      expect(u.searchParams.get('where')).toBe(
        "within_distance(geom,geom'POINT(2.341 48.861)',10km)"
      )
      expect(u.searchParams.get('limit')).toBe(String(OPENDATASOFT_PAGE_SIZE))
      expect(u.searchParams.get('offset')).toBe('0')
      expect(u.searchParams.get('select')).toContain('prix_nom')
    })
  })

  it('paginait par limit/offset (jamais un fetch par station) et déduplique', async () => {
    const seen: Array<{ offset: string | null; limit: string | null }> = []
    const page1 = [
      { ...REAL_RECORD_OPENDATASOFT },
      { ...REAL_RECORD_OPENDATASOFT, id: '75001004', prix_valeur: 2.55 }
    ]
    const page2 = [{ ...REAL_RECORD_OPENDATASOFT, id: '75001005', prix_valeur: 2.6 }]
    const mockFetch: MockFetch = async (input) => {
      const u = new URL(String(input))
      seen.push({ offset: u.searchParams.get('offset'), limit: u.searchParams.get('limit') })
      const offset = Number(u.searchParams.get('offset') ?? 0)
      if (offset === 0) return jsonResponseFromRecords(page1, 3)
      return jsonResponseFromRecords(page2, 3)
    }
    const provider = createOpendatasoftProvider({ fetchFn: mockFetch })
    const result = await provider.findNearbyStations(QUERY_PARIS)

    expect(seen.map((s) => s.offset)).toEqual(['0', '2'])
    expect(seen.every((s) => s.limit === String(OPENDATASOFT_PAGE_SIZE))).toBe(true)
    // 2 pages = 3 records bruts, tous normalisables (Gazole) → 3 stations.
    expect(result.stations).toHaveLength(3)
    expect(result.source).toBe('opendatasoft-api')
  })

  it('erreur HTTP 404 (dataset obsolète) → erreur explicite, pas de prix', async () => {
    const mockFetch = async (): Promise<Response> =>
      new Response('{"error_code":"NotFoundResource","message":"not found"}', {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    const provider = createOpendatasoftProvider({ fetchFn: mockFetch })
    await expect(provider.findNearbyStations(QUERY_PARIS)).rejects.toThrow(/404|dataset/)
  })
})

describe('provider export JSON complet (priorité 2)', () => {
  it('normalise et filtre par haversine depuis l\'export complet', async () => {
    // Records : un dans le rayon (Paris 1er), un loin (Bourg-en-Bresse).
    const records = [REAL_RECORD_OPENDATASOFT, REAL_RECORD_ROULEZ]
    const mockFetch = async (): Promise<Response> => jsonResponse(records)
    const provider = createJsonExportProvider({ fetchFn: mockFetch })

    const result = await provider.findNearbyStations(QUERY_PARIS)
    expect(result.source).toBe('opendatasoft-export')
    expect(result.stations.map((s) => s.id)).toEqual(['75001003'])
  })

  it('rejette un export non array avec erreur explicite', async () => {
    const mockFetch = async (): Promise<Response> => jsonResponse({ foo: 1 })
    const provider = createJsonExportProvider({ fetchFn: mockFetch })
    await expect(provider.findNearbyStations(QUERY_PARIS)).rejects.toThrow(/non array/)
  })
})

describe('provider roulez-eco (priorité 3)', () => {
  it('décompresse le zip et normalise les stations du XML', async () => {
    // Construit un zip contenant un XML conforme à la structure réelle.
    const xml = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<pdv_liste>
  <pdv id="1000001" latitude="4620100" longitude="519800" cp="01000" pop="R">
    <adresse>596 AVENUE DE TREVOUX</adresse>
    <ville>SAINT-DENIS-lès-BOURG</ville>
    <prix nom="Gazole" id="1" maj="2026-08-01T00:41:00" valeur="2.291"/>
    <rupture id="4" nom="GPLc" debut="2017-09-16T09:50:23" fin="" type="definitive"/>
  </pdv>
  <pdv id="1000002" latitude="4618800" longitude="524500" cp="01000" pop="R">
    <adresse>20 Avenue du Maréchal Juin</adresse>
    <ville>Bourg-en-Bresse</ville>
    <prix nom="Gazole" id="1" maj="2026-08-01T10:00:00" valeur="2.1"/>
  </pdv>
</pdv_liste>`
    const zip = makeZip('PrixCarburants_quotidien_20260802.xml', xml)
    const mockFetch = async (): Promise<Response> =>
      new Response(new Uint8Array(zip), { status: 200 })
    const provider = createRoulezEcoProvider({ fetchFn: mockFetch })

    // Query centrée sur Bourg-en-Bresse (46.201, 5.198), rayon 30 km.
    const query: NearbyStationQuery = {
      center: { lat: 46.201, lon: 5.198 },
      radiusKm: 30,
      fuel: 'Gazole'
    }
    const result = await provider.findNearbyStations(query)
    expect(result.source).toBe('roulez-eco')
    // 1000001 (Gazole 2.291) et 1000002 (Gazole 2.1) sont dans le rayon.
    expect(result.stations.map((s) => s.id).sort()).toEqual(['1000001', '1000002'])
    expect(result.stations.find((s) => s.id === '1000001')!.price).toBe(2.291)
  })

  it('exclut les stations fermées et en rupture dans le XML', async () => {
    const xml = `<?xml version="1.0"?>
<pdv_liste>
  <pdv id="1" latitude="4620100" longitude="519800" cp="01000">
    <adresse>A</adresse><ville>B</ville>
    <fermeture type="T" debut="2026-01-01" fin=""/>
  </pdv>
  <pdv id="2" latitude="4620100" longitude="519800" cp="01000">
    <adresse>C</adresse><ville>D</ville>
    <prix nom="Gazole" id="1" maj="2026-08-01T00:41:00" valeur="2.291"/>
    <rupture id="1" nom="Gazole" debut="2026-01-01" fin="" type="definitive"/>
  </pdv>
  <pdv id="3" latitude="4620100" longitude="519800" cp="01000">
    <adresse>E</adresse><ville>F</ville>
    <prix nom="Gazole" id="1" maj="2026-08-01T00:41:00" valeur="2.0"/>
  </pdv>
</pdv_liste>`
    const zip = makeZip('jour.xml', xml)
    const mockFetch = async (): Promise<Response> => new Response(new Uint8Array(zip), { status: 200 })
    const provider = createRoulezEcoProvider({ fetchFn: mockFetch })

    const query: NearbyStationQuery = {
      center: { lat: 46.201, lon: 5.198 },
      radiusKm: 30,
      fuel: 'Gazole'
    }
    const result = await provider.findNearbyStations(query)
    // Station 1 fermée → aucun prix ; station 2 rupture Gazole → exclue ;
    // station 3 → retenue.
    expect(result.stations.map((s) => s.id)).toEqual(['3'])
  })
})

describe('provider cache SQLite (priorité 4)', () => {
  it('sert le cache récent avec syncedAt (badge) et la source "cache"', async () => {
    const h = createTestDbHandle()
    try {
      const stationsRepo = createStationsRepository(h.db)
      const pricesRepo = createPricesRepository(h.db)
      const synced = new Date('2026-08-03T10:00:00Z')
      await stationsRepo.upsert({
        id: '75001003',
        name: 'TotalEnergies Bailleul',
        brand: 'TotalEnergies',
        brandWikidataId: 'Q154037',
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg',
        address: '8,10,10bis Rue Bailleul',
        city: 'PARIS',
        postalCode: '75001',
        latitude: 48.861,
        longitude: 2.341,
        departmentCode: null,
        regionCode: null,
        closed: false,
        syncedAt: synced
      })
      await pricesRepo.upsert({
        stationId: '75001003',
        fuel: 'Gazole',
        price: 2.59,
        updatedAt: new Date('2026-06-12T16:35:11Z'),
        rupture: false,
        syncedAt: synced
      })

      const now = new Date('2026-08-03T10:30:00Z')
      const provider = createCacheProvider(h.db, { now: () => now })
      const result = await provider.findNearbyStations(QUERY_PARIS)
      expect(result.source).toBe('cache')
      expect(result.syncedAt).toEqual(synced)
      expect(result.stations).toHaveLength(1)
      expect(result.stations[0]!.price).toBe(2.59)
      // Enrichissement (019) : le cache renvoie le nom réel, l'enseigne et le
      // logo stockés en base — jamais inventés, null si absents.
      expect(result.stations[0]!.name).toBe('TotalEnergies Bailleul')
      expect(result.stations[0]!.brand).toBe('TotalEnergies')
      expect(result.stations[0]!.brandWikidataId).toBe('Q154037')
      expect(result.stations[0]!.logoUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg')
    } finally {
      h.close()
    }
  })

  it('refuse un cache de plus de 24 h (FRE-2) sans signalement', async () => {
    const h = createTestDbHandle()
    try {
      const stationsRepo = createStationsRepository(h.db)
      const pricesRepo = createPricesRepository(h.db)
      const synced = new Date('2026-08-01T10:00:00Z')
      await stationsRepo.upsert({
        id: '75001003',
        name: '75001003',
        brand: null,
        address: 'x',
        city: 'PARIS',
        postalCode: '75001',
        latitude: 48.861,
        longitude: 2.341,
        departmentCode: null,
        regionCode: null,
        closed: false,
        syncedAt: synced
      })
      await pricesRepo.upsert({
        stationId: '75001003',
        fuel: 'Gazole',
        price: 2.59,
        updatedAt: new Date('2026-08-01T10:00:00Z'),
        rupture: false,
        syncedAt: synced
      })

      const now = new Date('2026-08-03T12:00:00Z') // > 24 h
      const provider = createCacheProvider(h.db, { now: () => now })
      await expect(provider.findNearbyStations(QUERY_PARIS)).rejects.toThrow(/24 h|ancienne/)
    } finally {
      h.close()
    }
  })

  it('ne sert pas un cache vide sans erreur inventée', async () => {
    const h = createTestDbHandle()
    try {
      const provider = createCacheProvider(h.db, { now: () => new Date() })
      await expect(provider.findNearbyStations(QUERY_PARIS)).rejects.toThrow(/aucune donnée/)
    } finally {
      h.close()
    }
  })
})

describe('chaîne de repli automatique (priorité 1 → 2 → 3 → 4)', () => {
  it('repli vers l\'export JSON quand Opendatasoft API échoue', async () => {
    const opendatasoft = {
      name: 'opendatasoft-api',
      findNearbyStations: async () => {
        throw new Error('API KO')
      }
    }
    const exportProvider = {
      name: 'opendatasoft-export',
      findNearbyStations: async () => ({
        stations: [] as StationPrice[],
        source: 'opendatasoft-export' as const,
        syncedAt: new Date()
      })
    }
    const chain = createFallbackChain({ providers: [opendatasoft, exportProvider] })
    const result = await chain.findNearbyStations(QUERY_PARIS)
    expect(result.source).toBe('opendatasoft-export')
  })

  it('repli complet API → export → roulez-eco → cache', async () => {
    const calls: string[] = []
    const cachedStations: StationPrice[] = [
      {
        id: '1',
        name: '1',
        brand: null,
        address: 'x',
        city: 'y',
        postalCode: '75001',
        position: { lat: 48.861, lon: 2.341 },
        fuel: 'Gazole',
        price: 2.1,
        updatedAt: new Date('2026-08-03T09:00:00Z')
      }
    ]
    const providers = [
      {
        name: 'opendatasoft-api',
        findNearbyStations: async () => {
          calls.push('opendatasoft-api')
          throw new Error('API KO')
        }
      },
      {
        name: 'opendatasoft-export',
        findNearbyStations: async () => {
          calls.push('opendatasoft-export')
          throw new Error('export KO')
        }
      },
      {
        name: 'roulez-eco',
        findNearbyStations: async () => {
          calls.push('roulez-eco')
          throw new Error('roulez KO')
        }
      },
      {
        name: 'cache',
        findNearbyStations: async () => {
          calls.push('cache')
          return {
            stations: cachedStations,
            source: 'cache' as const,
            syncedAt: new Date('2026-08-03T09:00:00Z')
          }
        }
      }
    ]
    const chain = createFallbackChain({ providers })
    const result = await chain.findNearbyStations(QUERY_PARIS)
    expect(result.source).toBe('cache')
    expect(result.stations).toEqual(cachedStations)
    expect(calls).toEqual(['opendatasoft-api', 'opendatasoft-export', 'roulez-eco', 'cache'])
  })

  it('échec total → erreur explicite, aucun prix inventé', async () => {
    const providers = [
      {
        name: 'opendatasoft-api',
        findNearbyStations: async () => {
          throw new Error('API KO')
        }
      },
      {
        name: 'opendatasoft-export',
        findNearbyStations: async () => {
          throw new Error('export KO')
        }
      }
    ]
    const chain = createFallbackChain({ providers })
    await expect(chain.findNearbyStations(QUERY_PARIS)).rejects.toThrow(/indisponibles/)
  })
})

// ——— Helper zip (déflate, structure minimale conforme au format ZIP) ———
function makeZip(filename: string, content: string): Buffer {
  const name = Buffer.from(filename, 'utf8')
  const data = Buffer.from(content, 'latin1')
  const compressed = deflateRawSync(data)
  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x04034b50, 0) // local file header signature
  localHeader.writeUInt16LE(20, 4) // version needed
  localHeader.writeUInt16LE(0x0800, 6) // flags (UTF-8)
  localHeader.writeUInt16LE(8, 8) // method = deflate
  localHeader.writeUInt16LE(0, 10) // mod time
  localHeader.writeUInt16LE(0x21, 12) // mod date
  localHeader.writeUInt32LE(0, 14) // crc32 (0, non vérifié par notre lecteur)
  localHeader.writeUInt32LE(compressed.length, 18)
  localHeader.writeUInt32LE(data.length, 22)
  localHeader.writeUInt16LE(name.length, 26)
  localHeader.writeUInt16LE(0, 28) // extra len

  const centralHeader = Buffer.alloc(46)
  centralHeader.writeUInt32LE(0x02014b50, 0) // central directory signature
  centralHeader.writeUInt16LE(20, 4)
  centralHeader.writeUInt16LE(20, 6)
  centralHeader.writeUInt16LE(0x0800, 8)
  centralHeader.writeUInt16LE(8, 10)
  centralHeader.writeUInt16LE(0, 12)
  centralHeader.writeUInt16LE(0x21, 14)
  centralHeader.writeUInt32LE(0, 16)
  centralHeader.writeUInt32LE(compressed.length, 20)
  centralHeader.writeUInt32LE(data.length, 24)
  centralHeader.writeUInt16LE(name.length, 28)
  centralHeader.writeUInt16LE(0, 30) // extra len
  centralHeader.writeUInt16LE(0, 32) // comment len
  centralHeader.writeUInt16LE(0, 34) // disk number
  centralHeader.writeUInt16LE(0, 36) // internal attrs
  centralHeader.writeUInt32LE(0, 38) // external attrs
  centralHeader.writeUInt32LE(0, 42) // local header offset

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralHeader.length, 12)
  eocd.writeUInt32LE(localHeader.length + name.length + compressed.length, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([
    localHeader,
    name,
    compressed,
    centralHeader,
    name,
    eocd
  ])
}
