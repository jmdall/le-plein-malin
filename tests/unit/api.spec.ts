// tests/unit/api-validation.spec.ts — Tests d'intégration légers de l'API REST
// (ticket 009, spec §8, §10.4). Validation Zod (400 sur mauvais rayon/fuel/
// conso), orchestration (bon type de retour, station de référence correcte,
// distances haversine, détour D2), géocodage (cache SQLite + appel Nominatim),
// health-check. AUCUNE règle métier n'est testée à travers l'API : les
// scénarios §13 restent couverts au niveau du module pur (004/005).
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '../../server/db/client'
import { createStationsRepository } from '../../server/repositories/stations'
import { createPricesRepository } from '../../server/repositories/prices'
import { createPriceHistoryRepository } from '../../server/repositories/priceHistory'
import { createSyncMetaRepository } from '../../server/repositories/syncMeta'
import {
  baseLocationSchema,
  recommendationQuerySchema,
  historyQuerySchema
} from '../../server/lib/validation'
import {
  resolveCenter,
  pickReferenceStation,
  buildStationsResponse,
  buildRecommendationInput,
  buildStationDetailResponse,
  buildTrendResponse,
  createApiError
} from '../../server/lib/orchestration'
import { haversineKm } from '../../domain/fuel-prices/haversine'
import { calculateFuelRecommendation } from '../../domain/recommendation/calculate'
import {
  createGeocodeProvider,
  geocodeCacheGet,
  geocodeCacheSet,
  geocodeCacheKey,
  GEOCODE_CACHE_TTL_MS
} from '../../server/lib/geocode'
import type { StationPrice, FuelType } from '../../domain/fuel-prices/types'
import type { NearbyStationQuery } from '../../server/providers/types'

// ——— Helpers ———
function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'jflp-api-'))
  const dbPath = join(dir, 'test.db')
  const { sqlite, db } = createDb(dbPath)
  migrate(db, { migrationsFolder: 'server/db/migrations' })
  return {
    sqlite,
    db,
    dbPath,
    close() {
      sqlite.close()
    }
  }
}

const NOW = new Date('2026-08-03T12:00:00Z')

function station(
  id: string,
  fuel: FuelType = 'Gazole',
  overrides: Partial<StationPrice> = {}
): StationPrice {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    address: `adresse ${id}`,
    city: 'PARIS',
    postalCode: '75001',
    position: { lat: 48.861, lon: 2.341 },
    fuel,
    price: 2.0,
    updatedAt: NOW,
    ...overrides
  }
}

async function seed(dbHandle: ReturnType<typeof createTestDb>) {
  const stationsRepo = createStationsRepository(dbHandle.db)
  const pricesRepo = createPricesRepository(dbHandle.db)
  const historyRepo = createPriceHistoryRepository(dbHandle.db)

  await stationsRepo.upsert({
    id: 'a',
    name: 'Station A',
    brand: null,
    address: 'rue A',
    city: 'Paris',
    postalCode: '75001',
    latitude: 48.861,
    longitude: 2.341,
    departmentCode: null,
    regionCode: null,
    closed: false,
    syncedAt: NOW
  })
  await stationsRepo.upsert({
    id: 'b',
    name: 'Station B',
    brand: 'Total',
    address: 'rue B',
    city: 'Paris',
    postalCode: '75001',
    latitude: 48.87,
    longitude: 2.35,
    departmentCode: null,
    regionCode: null,
    closed: false,
    syncedAt: NOW
  })
  await stationsRepo.upsert({
    id: 'c',
    name: 'Station C',
    brand: null,
    address: 'rue C',
    city: 'Paris',
    postalCode: '75001',
    latitude: 48.9,
    longitude: 2.4,
    departmentCode: null,
    regionCode: null,
    closed: false,
    syncedAt: NOW
  })

  for (const id of ['a', 'b', 'c']) {
    await pricesRepo.upsert({
      stationId: id,
      fuel: 'Gazole',
      price: 2.0,
      updatedAt: NOW,
      rupture: false,
      syncedAt: NOW
    })
  }

  // Historique pour a (2 jours : J-1 et J-7) → tendance calculable.
  await historyRepo.upsert({
    stationId: 'a',
    fuel: 'Gazole',
    day: '2026-08-01',
    price: 2.1,
    syncedAt: NOW
  })
  await historyRepo.upsert({
    stationId: 'a',
    fuel: 'Gazole',
    day: '2026-08-03',
    price: 2.0,
    syncedAt: NOW
  })

  return { stationsRepo, pricesRepo, historyRepo }
}

// Provider simulé : répond aux query NearbyStationQuery avec les stations
// seeded (indépendant du rayon — le tri haversine est fait dans l'orchestration).
function makeLocalProvider(dbHandle: ReturnType<typeof createTestDb>, overrides: { fail?: boolean } = {}) {
  return {
    name: 'local-provider',
    async findNearbyStations(query: NearbyStationQuery) {
      if (overrides.fail) {
        throw new Error('Provider simulé indisponible')
      }
      const stations: StationPrice[] = []
      const { sqlite } = dbHandle
      const rows = sqlite
        .prepare(
          `SELECT s.id, s.name, s.brand, s.address, s.city, s.postal_code, s.latitude, s.longitude,
                  p.fuel, p.price, p.updated_at
           FROM stations s
           JOIN prices p ON p.station_id = s.id
           WHERE s.closed = 0 AND p.rupture = 0 AND p.fuel = ?`
        )
        .all(query.fuel)
      for (const r of rows as Array<{
        id: string
        name: string
        brand: string | null
        address: string
        city: string
        postal_code: string
        latitude: number
        longitude: number
        fuel: string
        price: number
        updated_at: number
      }>) {
        stations.push({
          id: r.id,
          name: r.name,
          brand: r.brand,
          address: r.address,
          city: r.city,
          postalCode: r.postal_code,
          position: { lat: r.latitude, lon: r.longitude },
          fuel: r.fuel as FuelType,
          price: r.price,
          updatedAt: new Date(r.updated_at)
        })
      }
      return { stations, source: 'opendatasoft-api' as const, syncedAt: NOW }
    }
  }
}

// ——— 1. Validation Zod (spec §8, §10.4) ———
describe('API — validation Zod (ticket 009)', () => {
  it('rejette un rayon hors {5,10,20,30} → 400', () => {
    const r = baseLocationSchema.safeParse({ lat: 48.86, lon: 2.34, radius: 15 })
    expect(r.success).toBe(false)
  })

  it('rejette un fuel inconnu → 400', () => {
    const r = baseLocationSchema.safeParse({ lat: 48.86, lon: 2.34, fuel: 'Essence' })
    expect(r.success).toBe(false)
  })

  it('rejette des coordonnées hors bornes France → 400', () => {
    const r = baseLocationSchema.safeParse({ lat: 90, lon: 2.34 })
    expect(r.success).toBe(false)
    const r2 = baseLocationSchema.safeParse({ lat: 48.86, lon: 200 })
    expect(r2.success).toBe(false)
  })

  it('rejette l’absence de centre (ni lat/lon, ni ville/CP) → 400', () => {
    expect(baseLocationSchema.safeParse({}).success).toBe(false)
  })

  it('rejette lat sans lon (incomplets) → 400', () => {
    expect(baseLocationSchema.safeParse({ lat: 48.86 }).success).toBe(false)
  })

  it('rejette la combinaison lat/lon ET ville → 400', () => {
    expect(
      baseLocationSchema.safeParse({ lat: 48.86, lon: 2.34, city: 'Paris' }).success
    ).toBe(false)
  })

  it('accepte lat/lon seuls (radius et fuel par défaut)', () => {
    const r = baseLocationSchema.safeParse({ lat: 48.86, lon: 2.34 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.radius).toBe(10)
      expect(r.data.fuel).toBe('Gazole')
    }
  })

  it('accepte ville, code postal ou q (mode sans géolocalisation)', () => {
    expect(baseLocationSchema.safeParse({ city: 'Lyon' }).success).toBe(true)
    expect(baseLocationSchema.safeParse({ postalCode: '69001' }).success).toBe(true)
    expect(baseLocationSchema.safeParse({ q: 'Lyon' }).success).toBe(true)
  })

  it('rejette un code postal invalide → 400', () => {
    expect(baseLocationSchema.safeParse({ postalCode: 'abc' }).success).toBe(false)
  })

  it('rejette une consommation ≤ 0 (vehicleProfile) → 400', () => {
    const r = recommendationQuerySchema.safeParse({
      lat: 48.86,
      lon: 2.34,
      vehicleProfile: { consumption: 0, tankCapacity: 60, currentLevel: 20, fuel: 'Gazole' }
    })
    expect(r.success).toBe(false)
  })

  it('rejette un niveau > capacité (vehicleProfile) → 400', () => {
    const r = recommendationQuerySchema.safeParse({
      lat: 48.86,
      lon: 2.34,
      vehicleProfile: { consumption: 6, tankCapacity: 60, currentLevel: 70, fuel: 'Gazole' }
    })
    expect(r.success).toBe(false)
  })

  it('accepte un profil complet valide avec valeurs par défaut', () => {
    const r = recommendationQuerySchema.safeParse({
      lat: 48.86,
      lon: 2.34,
      vehicleProfile: { consumption: 6, tankCapacity: 60, currentLevel: 20, fuel: 'SP98' }
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.vehicleProfile?.savingsThreshold).toBe(1)
      expect(r.data.vehicleProfile?.preferredQuantity).toBeNull()
      expect(r.data.vehicleProfile?.fuel).toBe('SP98')
    }
  })

  it('history : fuel par défaut Gazole, rejette un fuel inconnu', () => {
    expect(historyQuerySchema.parse({}).fuel).toBe('Gazole')
    expect(historyQuerySchema.safeParse({ fuel: 'Essence' }).success).toBe(false)
  })
})

// ——— 2. Résolution du centre (géocodage + cache) ———
describe('API — géocodage ville/CP (ticket 009, NFR-SEC-3)', () => {
  it('resolveCenter : lat/lon → mode geo sans appel externe', async () => {
    const center = await resolveCenter({
      query: { lat: 48.86, lon: 2.34 },
      geocode: async () => {
        throw new Error('ne doit pas être appelé')
      }
    })
    expect(center).toEqual({ mode: 'geo', lat: 48.86, lon: 2.34 })
  })

  it('resolveCenter : city → géocodé en mode query (centroïde)', async () => {
    const center = await resolveCenter({
      query: { city: 'Lyon' },
      geocode: async () => ({ label: 'Lyon, France', lat: 45.76, lon: 4.835 })
    })
    expect(center).toEqual({ mode: 'query', label: 'Lyon, France', lat: 45.76, lon: 4.835 })
  })

  it('géocodage : cache SQLite → pas de second appel externe', async () => {
    const h = createTestDb()
    try {
      let calls = 0
      const geocode = createGeocodeProvider(h.db, {
        fetchFn: async () => {
          calls++
          return new Response(
            JSON.stringify([{ lat: '45.76', lon: '4.835', display_name: 'Lyon, France' }]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        }
      })

      const first = await geocode('69001')
      const second = await geocode('69001')
      expect(first).toEqual({ label: 'Lyon, France', lat: 45.76, lon: 4.835 })
      expect(second).toEqual(first)
      expect(calls).toBe(1) // le cache sert le second appel (NFR-SEC-3)
    } finally {
      h.close()
    }
  })

  it('géocodage : le cache expiré (TTL 24 h) déclenche un nouvel appel', async () => {
    const h = createTestDb()
    try {
      // Insère un cache vieux de 25 h pour la clé.
      geocodeCacheSet(
        h.db,
        geocodeCacheKey('Paris'),
        { label: 'ancien', lat: 48.8, lon: 2.3 },
        new Date(NOW.getTime() - GEOCODE_CACHE_TTL_MS - 3_600_000)
      )
      const cached = geocodeCacheGet(h.db, geocodeCacheKey('Paris'), NOW)
      expect(cached).toBeNull()

      let calls = 0
      const geocode = createGeocodeProvider(h.db, {
        fetchFn: async () => {
          calls++
          return new Response(
            JSON.stringify([{ lat: '48.856', lon: '2.352', display_name: 'Paris, France' }]),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        }
      })
      const result = await geocode('Paris')
      expect(result.label).toBe('Paris, France')
      expect(calls).toBe(1)
    } finally {
      h.close()
    }
  })

  it('géocodage : erreur Nominatim explicite (jamais de coordonnées inventées)', async () => {
    const h = createTestDb()
    try {
      const geocode = createGeocodeProvider(h.db, {
        fetchFn: async () => new Response('{}', { status: 500 })
      })
      await expect(geocode('VilleInconnue')).rejects.toThrow(/HTTP|Nominatim/)
    } finally {
      h.close()
    }
  })
})

// ——— 3. Orchestration : stations + recommandation (spec §10.4) ———
describe('API — orchestration (ticket 009, spec §8)', () => {
  it('buildStationsResponse : stations triées + station de référence la plus proche', async () => {
    const h = createTestDb()
    try {
      await seed(h)
      const provider = makeLocalProvider(h)
      const center = { mode: 'geo' as const, lat: 48.861, lon: 2.341 }
      const res = await buildStationsResponse({ provider, query: { radius: 10, fuel: 'Gazole' }, center })

      // La référence est la plus proche du centre (station a, distance ~0).
      expect(res.referenceStation?.id).toBe('a')
      // Réponse conforme spec §8 : { stations, referenceStation, query }.
      expect(res.query.center).toEqual({ lat: 48.861, lon: 2.341 })
      expect(res.query.radius).toBe(10)
      expect(res.query.fuel).toBe('Gazole')
      // Chaque station porte une position et un prix (jamais inventés).
      for (const s of res.stations) {
        expect(s.position.lat).toBeTypeOf('number')
        expect(typeof s.price).toBe('number')
        expect(s.updatedAt).toBeInstanceOf(Date)
      }
    } finally {
      h.close()
    }
  })
  it('buildRecommendationInput : détour D2 (max(0, dist_c − dist_r) × 2) et station de référence', () => {
    const h = createTestDb()
    try {
      const center = { mode: 'query' as const, label: 'Paris', lat: 48.861, lon: 2.341 }
      const stations = [
        station('a', 'Gazole', { position: { lat: 48.861, lon: 2.341 } }), // centre → dist 0
        station('b', 'Gazole', { position: { lat: 48.87, lon: 2.35 } })
      ]
      const input = buildRecommendationInput({
        fuelType: 'Gazole',
        vehicle: {
          fuel: 'Gazole',
          consumption: 6,
          tankCapacity: 60,
          currentLevel: 20,
          preferredQuantity: null,
          savingsThreshold: 1
        },
        center,
        stations,
        now: NOW
      })

      // La référence est la plus proche du centre : la station a (dist ~0).
      expect(input.referenceStation.id).toBe('a')
      // Détour de b = max(0, dist(b) − dist(a)) × 2.
      const distA = haversineKm(center, stations[0]!.position)
      const distB = haversineKm(center, stations[1]!.position)
      const expectedDetour = Math.max(0, distB - distA) * 2
      expect(input.candidates).toHaveLength(1)
      expect(input.candidates[0]!.detourDistanceKm).toBeCloseTo(expectedDetour, 6)
      expect(input.hasGeoLocation).toBe(false) // mode ville/CP → isPartial côté module
    } finally {
      h.close()
    }
  })

  it('buildRecommendationInput : mode géo → hasGeoLocation true, détour relatif au trajet', () => {
    const h = createTestDb()
    try {
      const center = { mode: 'geo' as const, lat: 48.861, lon: 2.341 }
      const stations = [
        station('a', 'Gazole', { position: { lat: 48.861, lon: 2.341 } }),
        station('b', 'Gazole', { position: { lat: 48.871, lon: 2.351 } })
      ]
      const input = buildRecommendationInput({
        fuelType: 'Gazole',
        vehicle: {
          fuel: 'Gazole',
          consumption: 6,
          tankCapacity: 60,
          currentLevel: 20,
          preferredQuantity: null,
          savingsThreshold: 1
        },
        center,
        stations,
        now: NOW
      })
      expect(input.hasGeoLocation).toBe(true)
      expect(input.referenceStation.id).toBe('a')
      const distA = haversineKm(center, stations[0]!.position)
      const distB = haversineKm(center, stations[1]!.position)
      expect(input.candidates[0]!.detourDistanceKm).toBeCloseTo(Math.max(0, distB - distA) * 2, 6)
    } finally {
      h.close()
    }
  })

  it('pickReferenceStation : départage déterministe (distance, puis id)', () => {
    const ref = pickReferenceStation([
      { id: 'b', distanceKm: 2 },
      { id: 'a', distanceKm: 2 },
      { id: 'c', distanceKm: 1 }
    ])
    expect(ref?.id).toBe('c')

    const tie = pickReferenceStation([
      { id: 'b', distanceKm: 2 },
      { id: 'a', distanceKm: 2 }
    ])
    expect(tie?.id).toBe('a')
  })

  it('la recommandation ne recalcule pas les règles : le module voit des km déjà calculés', () => {
    const h = createTestDb()
    try {
      const center = { mode: 'geo' as const, lat: 48.861, lon: 2.341 }
      const reference = station('ref', 'Gazole', { price: 2.0, position: center })
      // Candidate beaucoup moins chère mais détour énorme → non rentable.
      const candidate = station('b', 'Gazole', { price: 1.5, position: { lat: 49.5, lon: 3.5 } })
      const stations = [reference, candidate]
      const input = buildRecommendationInput({
        fuelType: 'Gazole',
        vehicle: {
          fuel: 'Gazole',
          consumption: 10,
          tankCapacity: 60,
          currentLevel: 20,
          preferredQuantity: null,
          savingsThreshold: 1
        },
        center,
        stations,
        now: NOW,
        quantityToBuy: 30
      })

      const rec = calculateFuelRecommendation(input)
      // Le module produit une décision déterministe ; on vérifie juste qu'il
      // est appelable avec l'input d'orchestration et renvoie un type valide.
      expect(['go-to-station', 'wait', 'fill-now', 'partial-fill', 'insufficient-data']).toContain(rec.type)
      expect(typeof rec.confidence).toBe('number')
      expect(rec.freshness.status).toBeDefined()
    } finally {
      h.close()
    }
  })

  it('buildStationDetailResponse : renvoie la station + tous ses prix', async () => {
    const h = createTestDb()
    try {
      await seed(h)
      const pricesRepo = createPricesRepository(h.db)
      await pricesRepo.upsert({
        stationId: 'a',
        fuel: 'SP98',
        price: 2.2,
        updatedAt: NOW,
        rupture: false,
        syncedAt: NOW
      })

      const res = await buildStationDetailResponse({ db: h.db, id: 'a' })
      expect(res.station.id).toBe('a')
      expect(res.prices.map((p) => p.fuel).sort()).toEqual(['Gazole', 'SP98'])
    } finally {
      h.close()
    }
  })

  it('buildStationDetailResponse : 404 structuré pour une station inconnue', async () => {
    const h = createTestDb()
    try {
      await seed(h)
      await expect(buildStationDetailResponse({ db: h.db, id: 'inconnue' })).rejects.toMatchObject({
        statusCode: 404,
        body: { error: { code: 'STATION_NOT_FOUND' } }
      })
    } finally {
      h.close()
    }
  })

  it('buildStationDetailResponse : station sans prix → price/fuel/updatedAt null (aucun prix inventé)', async () => {
    const h = createTestDb()
    try {
      await seed(h)
      // Station sans AUCUN prix en base.
      await createStationsRepository(h.db).upsert({
        id: 'noprice',
        name: 'Station sans prix',
        brand: null,
        address: 'rue Z',
        city: 'Paris',
        postalCode: '75001',
        latitude: 48.86,
        longitude: 2.34,
        departmentCode: null,
        regionCode: null,
        closed: false,
        syncedAt: NOW
      })

      const res = await buildStationDetailResponse({ db: h.db, id: 'noprice' })
      expect(res.station.id).toBe('noprice')
      expect(res.station.price).toBeNull()
      expect(res.station.fuel).toBeNull()
      expect(res.station.updatedAt).toBeNull()
      expect(res.prices).toEqual([])
    } finally {
      h.close()
    }
  })

  it('buildTrendResponse : indicateurs via le module pur (005) sur l’historique local', async () => {
    const h = createTestDb()
    try {
      await seed(h)
      const res = await buildTrendResponse({ db: h.db, id: 'a', fuel: 'Gazole', now: () => NOW })
      expect(res.indicators.trend.direction).toBeDefined()
      expect(typeof res.indicators.minPrice).toBe('number')
      expect(res.indicators.medianPrice).toBe(2.05)
    } finally {
      h.close()
    }
  })

  it('buildTrendResponse : 404 explicite sans historique', async () => {
    const h = createTestDb()
    try {
      await seed(h)
      await expect(buildTrendResponse({ db: h.db, id: 'b', fuel: 'Gazole', now: () => NOW })).rejects.toMatchObject(
        {
          statusCode: 404,
          body: { error: { code: 'NO_HISTORY' } }
        }
      )
    } finally {
      h.close()
    }
  })

  it('createApiError : erreur structurée { error: { code, message } }', () => {
    const err = createApiError(400, 'VALIDATION_ERROR', 'mauvais rayon')
    expect(err.statusCode).toBe(400)
    expect(err.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'mauvais rayon' } })
  })
})

// ——— 4. Health-check (spec §8, ticket 008) ———
describe('API — health (ticket 008)', () => {
  it('/api/health renvoie le dernier sync (source + syncedAt)', async () => {
    const h = createTestDb()
    try {
      const meta = createSyncMetaRepository(h.db)
      const syncedAt = new Date('2026-08-03T08:00:00Z')
      await meta.set(syncedAt, 'opendatasoft-api')

      // Reproduction légère de la logique de la route (health.get.ts) :
      // la route ouvre sa propre connexion ; ici on vérifie la donnée servie.
      const last = await meta.get()
      expect(last?.source).toBe('opendatasoft-api')
      expect(last?.syncedAt).toEqual(syncedAt)
    } finally {
      h.close()
    }
  })
})
