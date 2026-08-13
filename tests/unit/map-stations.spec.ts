// tests/unit/map-stations.spec.ts — Endpoint carte par emprise (ticket 037).
// La carte doit pouvoir demander « qu'y a-t-il dans cette zone ? », question
// distincte de « où faire le plein ? » (/api/stations, par rayon). Cet endpoint
// ne calcule AUCUNE grandeur d'économie : sans station de référence, une
// économie nette n'existe pas.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '../../server/db/client'
import { mapBoundsSchema, MAP_MAX_STATIONS } from '../../server/lib/validation'
import { buildMapStationsResponse } from '../../server/lib/map-stations'
import { createStationsRepository } from '../../server/repositories/stations'
import { createPricesRepository } from '../../server/repositories/prices'

function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'jflp-map-'))
  const { sqlite, db } = createDb(join(dir, 'test.db'))
  migrate(db, { migrationsFolder: 'server/db/migrations' })
  return { db, close: () => sqlite.close() }
}

const NOW = new Date('2026-08-13T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

// Emprise Île-de-France, assez large pour contenir les stations de test.
const IDF = { swLat: 48.1, swLon: 1.4, neLat: 49.2, neLon: 3.6 }

async function seed(
  db: ReturnType<typeof createTestDb>['db'],
  rows: Array<{
    id: string
    lat: number
    lon: number
    price?: number
    fuel?: string
    updatedAt?: Date
    closed?: boolean
  }>
) {
  const stationsRepo = createStationsRepository(db)
  const pricesRepo = createPricesRepository(db)
  for (const row of rows) {
    await stationsRepo.upsert({
      id: row.id,
      name: `Station ${row.id}`,
      brand: null,
      brandWikidataId: null,
      logoUrl: null,
      address: '1 rue du Test',
      city: 'Paris',
      postalCode: '75001',
      latitude: row.lat,
      longitude: row.lon,
      departmentCode: '75',
      regionCode: '11',
      closed: row.closed ?? false,
      syncedAt: NOW
    })
    if (row.price !== undefined) {
      await pricesRepo.upsert({
        stationId: row.id,
        fuel: row.fuel ?? 'Gazole',
        price: row.price,
        updatedAt: row.updatedAt ?? hoursAgo(2),
        rupture: false,
        syncedAt: NOW
      })
    }
  }
}

describe('mapBoundsSchema (ticket 037)', () => {
  const valid = { ...IDF, fuel: 'Gazole' }

  it('accepte une emprise cohérente en France', () => {
    const parsed = mapBoundsSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.fuel).toBe('Gazole')
  })

  it('carburant par défaut Gazole, comme les autres endpoints', () => {
    const parsed = mapBoundsSchema.safeParse(IDF)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.fuel).toBe('Gazole')
  })

  it('rejette une emprise inversée (sud au-dessus du nord)', () => {
    expect(mapBoundsSchema.safeParse({ ...valid, swLat: 49.5, neLat: 48.1 }).success).toBe(false)
    expect(mapBoundsSchema.safeParse({ ...valid, swLon: 3.9, neLon: 1.4 }).success).toBe(false)
  })

  it('rejette une emprise dégénérée (coin identique)', () => {
    expect(
      mapBoundsSchema.safeParse({ swLat: 48.5, neLat: 48.5, swLon: 2.3, neLon: 2.3, fuel: 'Gazole' })
        .success
    ).toBe(false)
  })

  it('rejette une emprise hors France (bornes API, spec §14 #14)', () => {
    // La Réunion : latitude négative, hors bornes métropolitaines.
    expect(
      mapBoundsSchema.safeParse({ swLat: -21.4, swLon: 55.2, neLat: -20.8, neLon: 55.8 }).success
    ).toBe(false)
  })

  it('rejette une emprise incomplète ou non numérique', () => {
    expect(mapBoundsSchema.safeParse({ swLat: 48.1, swLon: 1.4 }).success).toBe(false)
    expect(mapBoundsSchema.safeParse({ ...valid, neLat: 'nord' }).success).toBe(false)
  })

  it('rejette un carburant inconnu', () => {
    expect(mapBoundsSchema.safeParse({ ...valid, fuel: 'Essence' }).success).toBe(false)
  })
})

describe('buildMapStationsResponse (ticket 037)', () => {
  it('renvoie les stations de l’emprise, avec prix et fraîcheur du serveur', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [
        { id: 'dedans', lat: 48.8566, lon: 2.3522, price: 1.799, updatedAt: hoursAgo(3) }
      ])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations).toHaveLength(1)
      expect(res.stations[0]).toEqual({
        id: 'dedans',
        lat: 48.8566,
        lon: 2.3522,
        price: 1.799,
        ageInHours: 3,
        status: 'fresh'
      })
      expect(res.fuel).toBe('Gazole')
      expect(res.truncated).toBe(false)
    } finally {
      h.close()
    }
  })

  it('exclut ce qui est hors de l’emprise', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [
        { id: 'dedans', lat: 48.8566, lon: 2.3522, price: 1.8 },
        // Marseille : dans les bornes France, hors de l'emprise Île-de-France.
        { id: 'dehors', lat: 43.2965, lon: 5.3698, price: 1.7 }
      ])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations.map((s) => s.id)).toEqual(['dedans'])
    } finally {
      h.close()
    }
  })

  it('inclut les stations exactement sur la frontière de l’emprise', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [
        { id: 'coin-sw', lat: IDF.swLat, lon: IDF.swLon, price: 1.8 },
        { id: 'coin-ne', lat: IDF.neLat, lon: IDF.neLon, price: 1.9 }
      ])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations.map((s) => s.id).sort()).toEqual(['coin-ne', 'coin-sw'])
    } finally {
      h.close()
    }
  })

  it('n’invente aucun prix : une station sans prix pour ce carburant n’apparaît pas', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [
        { id: 'avec-gazole', lat: 48.85, lon: 2.35, price: 1.8, fuel: 'Gazole' },
        { id: 'sans-prix', lat: 48.86, lon: 2.36 },
        { id: 'autre-carburant', lat: 48.87, lon: 2.37, price: 1.95, fuel: 'SP98' }
      ])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations.map((s) => s.id)).toEqual(['avec-gazole'])
    } finally {
      h.close()
    }
  })

  it('exclut les stations fermées', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [
        { id: 'ouverte', lat: 48.85, lon: 2.35, price: 1.8 },
        { id: 'fermee', lat: 48.86, lon: 2.36, price: 1.7, closed: true }
      ])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations.map((s) => s.id)).toEqual(['ouverte'])
    } finally {
      h.close()
    }
  })

  // La fraîcheur vient du serveur : l'UI ne recalcule pas la règle 24 h / 48 h.
  it('classe la fraîcheur comme le domaine (24 h → stale, 48 h → obsolete)', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [
        { id: 'frais', lat: 48.85, lon: 2.35, price: 1.8, updatedAt: hoursAgo(2) },
        { id: 'stale', lat: 48.86, lon: 2.36, price: 1.8, updatedAt: hoursAgo(30) },
        { id: 'obsolete', lat: 48.87, lon: 2.37, price: 1.8, updatedAt: hoursAgo(60) }
      ])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      const byId = new Map(res.stations.map((s) => [s.id, s]))
      expect(byId.get('frais')!.status).toBe('fresh')
      expect(byId.get('stale')!.status).toBe('stale')
      expect(byId.get('obsolete')!.status).toBe('obsolete')
      expect(byId.get('obsolete')!.ageInHours).toBe(60)
    } finally {
      h.close()
    }
  })

  // Les prix périmés restent VISIBLES avec leur statut (CONTEXT.md §Fraîcheur) :
  // ils sont exclus des recommandations, pas de la carte.
  it('garde les prix périmés dans la réponse, avec leur statut', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [{ id: 'vieux', lat: 48.85, lon: 2.35, price: 1.8, updatedAt: hoursAgo(72) }])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations).toHaveLength(1)
      expect(res.stations[0]!.status).toBe('obsolete')
    } finally {
      h.close()
    }
  })

  it('arrondit les coordonnées à 5 décimales (précision d’affichage)', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [{ id: 'precis', lat: 48.85662345678, lon: 2.35221987654, price: 1.8 }])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations[0]!.lat).toBe(48.85662)
      expect(res.stations[0]!.lon).toBe(2.35222)
    } finally {
      h.close()
    }
  })

  // L'âge sort du domaine en flottant : 18 caractères par station, ~180 Ko sur
  // la France entière pour une précision dont un marqueur n'a aucun usage.
  it('arrondit l’âge à l’heure (charge utile)', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [{ id: 'a', lat: 48.85, lon: 2.35, price: 1.8, updatedAt: hoursAgo(3.4) }])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations[0]!.ageInHours).toBe(3)
    } finally {
      h.close()
    }
  })

  // L'arrondi de l'âge ne doit JAMAIS déplacer un seuil de fraîcheur : le statut
  // est calculé par le domaine sur la valeur exacte. C'est précisément pourquoi
  // `status` est transmis et non redérivé côté client à partir de `ageInHours`.
  it('l’arrondi de l’âge ne déplace pas le seuil de fraîcheur', async () => {
    const h = createTestDb()
    try {
      // 24,4 h : arrondi à 24 (qui semblerait « frais »), mais réellement stale.
      await seed(h.db, [{ id: 'limite', lat: 48.85, lon: 2.35, price: 1.8, updatedAt: hoursAgo(24.4) }])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations[0]!.ageInHours).toBe(24)
      expect(res.stations[0]!.status).toBe('stale')
    } finally {
      h.close()
    }
  })

  it('renvoie l’emprise et le carburant demandés (l’UI ne les redevine pas)', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [{ id: 'a', lat: 48.85, lon: 2.35, price: 1.8, fuel: 'SP98' }])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'SP98',
        now: () => NOW
      })
      expect(res.bounds).toEqual(IDF)
      expect(res.fuel).toBe('SP98')
    } finally {
      h.close()
    }
  })

  it('emprise vide : aucune station, pas d’erreur', async () => {
    const h = createTestDb()
    try {
      await seed(h.db, [{ id: 'loin', lat: 43.2965, lon: 5.3698, price: 1.7 }])
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW
      })
      expect(res.stations).toEqual([])
      expect(res.truncated).toBe(false)
    } finally {
      h.close()
    }
  })

  // Plafond : il ne peut pas se déclencher avec les données actuelles (emprise
  // bornée à la France ⇒ maximum = taille du jeu). C'est une garde pour le jour
  // où l'une des deux hypothèses tombe — et elle n'est jamais silencieuse.
  it('plafonne et le signale (truncated), sans tronquer en silence', async () => {
    const h = createTestDb()
    try {
      const many = Array.from({ length: 12 }, (_v, i) => ({
        id: `s${i}`,
        lat: 48.5 + i / 1000,
        lon: 2.3 + i / 1000,
        price: 1.8
      }))
      await seed(h.db, many)
      const res = await buildMapStationsResponse({
        db: h.db,
        bounds: IDF,
        fuel: 'Gazole',
        now: () => NOW,
        maxStations: 5
      })
      expect(res.stations).toHaveLength(5)
      expect(res.truncated).toBe(true)
    } finally {
      h.close()
    }
  })

  it('le plafond par défaut est celui de la validation', () => {
    expect(MAP_MAX_STATIONS).toBeGreaterThan(10_000)
  })
})
