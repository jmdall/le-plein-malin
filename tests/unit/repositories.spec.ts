// tests/unit/repositories.spec.ts — Tests d'intégration des repositories
// (server/repositories/*) sur SQLite temporaire. Aucune règle métier testée ici.
import { describe, expect, it, afterEach } from 'vitest'
import { createTestDb } from '../helpers/db'
import { createStationsRepository } from '../../server/repositories/stations'
import { createPricesRepository } from '../../server/repositories/prices'
import { createPriceHistoryRepository } from '../../server/repositories/priceHistory'
import { createVehicleProfileRepository } from '../../server/repositories/vehicleProfile'
import { createFavoritesRepository } from '../../server/repositories/favorites'

let dbHandle: ReturnType<typeof createTestDb> | undefined

afterEach(() => {
  dbHandle?.close()
  dbHandle = undefined
})

function setup() {
  dbHandle = createTestDb()
  return dbHandle
}

describe('repositories (intégration SQLite)', () => {
  it('upsert stations : insère puis met à jour (même id)', async () => {
    const { db } = setup()
    const stationsRepo = createStationsRepository(db)
    const row = {
      id: '1',
      name: 'Total Access Gennevilliers',
      brand: null,
      address: '12 rue de Paris',
      city: 'Gennevilliers',
      postalCode: '92230',
      latitude: 48.9333,
      longitude: 2.3,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    }
    await stationsRepo.upsert(row)
    await stationsRepo.upsert({ ...row, name: 'Renommée' })

    const stored = await stationsRepo.findById('1')
    expect(stored?.name).toBe('Renommée')
    expect(stored?.latitude).toBe(48.9333)
    expect(await stationsRepo.count()).toBe(1)
  })

  it('prices : upsert par (station_id, fuel) et lecture par station', async () => {
    const { db } = setup()
    const stationsRepo = createStationsRepository(db)
    const pricesRepo = createPricesRepository(db)

    await stationsRepo.upsert({
      id: '2',
      name: 'Leclerc',
      brand: 'Leclerc',
      address: 'ZAC des Groues',
      city: 'Colombes',
      postalCode: '92700',
      latitude: 48.928,
      longitude: 2.254,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    })
    await pricesRepo.upsert({
      stationId: '2',
      fuel: 'Gazole',
      price: 1.689,
      updatedAt: new Date('2026-08-03T09:00:00Z'),
      rupture: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    })
    await pricesRepo.upsert({
      stationId: '2',
      fuel: 'E10',
      price: 1.759,
      updatedAt: new Date('2026-08-03T09:00:00Z'),
      rupture: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    })
    // Upsert quotidien : le prix du jour remplace le précédent
    await pricesRepo.upsert({
      stationId: '2',
      fuel: 'Gazole',
      price: 1.679,
      updatedAt: new Date('2026-08-03T11:00:00Z'),
      rupture: false,
      syncedAt: new Date('2026-08-03T11:00:00Z')
    })

    const byStation = await pricesRepo.findByStation('2')
    expect(byStation).toHaveLength(2)
    const gazole = await pricesRepo.findByStationAndFuel('2', 'Gazole')
    expect(gazole?.price).toBe(1.679)
  })

  it('price_history : upsert quotidien par (station_id, fuel, day)', async () => {
    const { db } = setup()
    const stationsRepo = createStationsRepository(db)
    const historyRepo = createPriceHistoryRepository(db)

    await stationsRepo.upsert({
      id: '3',
      name: 'Carrefour',
      brand: 'Carrefour',
      address: '1 av de la gare',
      city: 'Asnières',
      postalCode: '92600',
      latitude: 48.91,
      longitude: 2.29,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    })

    await historyRepo.upsert({
      stationId: '3',
      fuel: 'SP98',
      day: '2026-08-01',
      price: 1.899,
      syncedAt: new Date('2026-08-01T10:00:00Z')
    })
    await historyRepo.upsert({
      stationId: '3',
      fuel: 'SP98',
      day: '2026-08-02',
      price: 1.889,
      syncedAt: new Date('2026-08-02T10:00:00Z')
    })
    // Même jour : le dernier prix remplace le précédent (snapshot quotidien)
    await historyRepo.upsert({
      stationId: '3',
      fuel: 'SP98',
      day: '2026-08-02',
      price: 1.879,
      syncedAt: new Date('2026-08-02T14:00:00Z')
    })

    const history = await historyRepo.findByStationAndFuel('3', 'SP98')
    expect(history).toEqual([
      { day: '2026-08-01', price: 1.899 },
      { day: '2026-08-02', price: 1.879 }
    ])
    expect(await historyRepo.count()).toBe(2)
  })

  it('lecture par (fuel, rayon, centre) : distance haversine + exclusions', async () => {
    const { db } = setup()
    const stationsRepo = createStationsRepository(db)
    const pricesRepo = createPricesRepository(db)

    // Centre : Paris 13e (48.8320, 2.3560)
    const close = {
      id: '10',
      name: 'Proche',
      brand: null,
      address: '1 rue',
      city: 'Paris',
      postalCode: '75013',
      latitude: 48.832,
      longitude: 2.356,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    }
    const far = {
      id: '11',
      name: 'Loin',
      brand: null,
      address: '2 rue',
      city: 'Paris',
      postalCode: '75013',
      latitude: 48.9,
      longitude: 2.5,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    }
    const closed = {
      id: '12',
      name: 'Fermée',
      brand: null,
      address: '3 rue',
      city: 'Paris',
      postalCode: '75013',
      latitude: 48.8321,
      longitude: 2.3561,
      departmentCode: null,
      regionCode: null,
      closed: true,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    }
    const ruptured = {
      id: '13',
      name: 'Rupture',
      brand: null,
      address: '4 rue',
      city: 'Paris',
      postalCode: '75013',
      latitude: 48.8322,
      longitude: 2.3562,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    }
    await stationsRepo.upsertMany([close, far, closed, ruptured])

    const now = new Date('2026-08-03T10:00:00Z')
    for (const s of [close, far, closed, ruptured]) {
      await pricesRepo.upsert({
        stationId: s.id,
        fuel: 'Gazole',
        price: 1.7,
        updatedAt: now,
        rupture: s.id === '13',
        syncedAt: now
      })
    }

    const result = await pricesRepo.findByFuelInRadius('Gazole', 48.832, 2.356, 5)
    expect(result.map((r) => r.id)).toEqual(['10'])
    expect(result[0]!.distanceKm).toBeLessThan(0.1)
  })

  it('vehicle_profile : seed singleton par défaut (seuil 1 €) + put', async () => {
    const { db } = setup()
    const vehicleRepo = createVehicleProfileRepository(db)

    const first = await vehicleRepo.get()
    expect(first.savingsThreshold).toBe(1)
    expect(first.fuel).toBe('Gazole')

    const updated = await vehicleRepo.put({
      fuel: 'SP95',
      consumption: 7,
      tankCapacity: 55,
      currentLevel: 20,
      preferredQuantity: 40,
      savingsThreshold: 2
    })
    expect(updated.fuel).toBe('SP95')
    expect(updated.preferredQuantity).toBe(40)
    expect(updated.savingsThreshold).toBe(2)

    // Toujours le singleton : une seule ligne
    const { sqlite } = dbHandle!
    const count = sqlite.prepare('SELECT count(*) AS n FROM vehicle_profile').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('favorites : add/remove/list + FK cascade', async () => {
    const { db, sqlite } = setup()
    const stationsRepo = createStationsRepository(db)
    const favoritesRepo = createFavoritesRepository(db)

    await stationsRepo.upsert({
      id: '20',
      name: 'BP',
      brand: 'BP',
      address: '5 rue',
      city: 'Issy',
      postalCode: '92130',
      latitude: 48.82,
      longitude: 2.28,
      departmentCode: null,
      regionCode: null,
      closed: false,
      syncedAt: new Date('2026-08-03T10:00:00Z')
    })

    await favoritesRepo.add('20')
    await favoritesRepo.add('20') // idempotent
    expect(await favoritesRepo.list()).toHaveLength(1)
    expect((await favoritesRepo.findByStation('20'))?.stationId).toBe('20')

    await favoritesRepo.remove('20')
    expect(await favoritesRepo.list()).toHaveLength(0)

    // FK : supprimer la station supprime le favori (ON DELETE CASCADE)
    await favoritesRepo.add('20')
    sqlite.prepare("DELETE FROM stations WHERE id = '20'").run()
    expect(await favoritesRepo.list()).toHaveLength(0)
  })
})
