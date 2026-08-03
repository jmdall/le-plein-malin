// tests/unit/schedule.spec.ts — Tests de la planification du job (ticket 008,
// spec §9.6) : parsing de l'intervalle env, démarrage sans blocage, premier
// tick différé, arrêt propre.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { createTestDb } from '../helpers/db'
import {
  DEFAULT_SYNC_INTERVAL_HOURS,
  HOUR_MS,
  parseSyncIntervalHours,
  scheduleSyncPrices
} from '../../server/jobs/schedule'
import { createSyncPricesJob } from '../../server/jobs/syncPrices'
import { createSyncMetaRepository } from '../../server/repositories/syncMeta'
import type { FuelPriceProvider, ProviderResult } from '../../server/providers/types'
import type { StationPrice, FuelType } from '../../domain/fuel-prices/types'

let dbHandle: ReturnType<typeof createTestDb> | undefined

afterEach(() => {
  dbHandle?.close()
  dbHandle = undefined
  vi.useRealTimers()
})

function makeProvider(state: StationPrice[] = []): FuelPriceProvider {
  return {
    name: 'simulated',
    async findNearbyStations(): Promise<ProviderResult> {
      return { stations: state, source: 'opendatasoft-api', syncedAt: new Date() }
    }
  }
}

describe('parseSyncIntervalHours', () => {
  it('défaut : 2 h quand env absente ou invalide', () => {
    expect(parseSyncIntervalHours(undefined)).toBe(DEFAULT_SYNC_INTERVAL_HOURS)
    expect(parseSyncIntervalHours('')).toBe(DEFAULT_SYNC_INTERVAL_HOURS)
    expect(parseSyncIntervalHours('abc')).toBe(DEFAULT_SYNC_INTERVAL_HOURS)
    expect(parseSyncIntervalHours('0')).toBe(DEFAULT_SYNC_INTERVAL_HOURS)
    expect(parseSyncIntervalHours('-1')).toBe(DEFAULT_SYNC_INTERVAL_HOURS)
  })

  it('interprète une valeur numérique positive', () => {
    expect(parseSyncIntervalHours('4')).toBe(4)
    expect(parseSyncIntervalHours('0.5')).toBe(0.5)
  })
})

describe('scheduleSyncPrices', () => {
  it('premier tick différé : le démarrage n\'exécute pas le job immédiatement', () => {
    dbHandle = createTestDb()
    const onSync = vi.fn()
    const stop = scheduleSyncPrices({
      db: dbHandle.db,
      provider: makeProvider(),
      intervalHours: 24,
      onSync
    })

    // Aucun tick au démarrage : le premier est à +1 intervalle.
    expect(onSync).not.toHaveBeenCalled()
    stop()
  })

  it('exécute un tick après une période et s\'arrête proprement', async () => {
    dbHandle = createTestDb()
    vi.useFakeTimers()
    const onSync = vi.fn()

    const stop = scheduleSyncPrices({
      db: dbHandle.db,
      provider: makeProvider(),
      intervalHours: 1,
      onSync
    })

    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(onSync).toHaveBeenCalledTimes(1)

    // Deuxième tick après une autre période.
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(onSync).toHaveBeenCalledTimes(2)

    // Stop → plus aucun tick.
    stop()
    await vi.advanceTimersByTimeAsync(3 * HOUR_MS)
    expect(onSync).toHaveBeenCalledTimes(2)
  })

  it('un échec de tick est journalisé sans faire tomber le scheduler (retentative au tick suivant)', async () => {
    dbHandle = createTestDb()
    vi.useFakeTimers()
    const onError = vi.fn()

    const failingProvider = {
      name: 'simulated-fail',
      async findNearbyStations(): Promise<ProviderResult> {
        throw new Error('Source KO')
      }
    }

    const stop = scheduleSyncPrices({
      db: dbHandle.db,
      provider: failingProvider,
      intervalHours: 1,
      onError
    })

    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(onError).toHaveBeenCalledTimes(1)

    // Le scheduler continue de tourner au tick suivant.
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(onError).toHaveBeenCalledTimes(2)

    stop()
  })

  it('un tick réussi marque last_sync (lisible par /api/health)', async () => {
    dbHandle = createTestDb()
    vi.useFakeTimers()

    const station: StationPrice = {
      id: '1',
      name: '1',
      brand: null,
      address: 'x',
      city: 'PARIS',
      postalCode: '75001',
      position: { lat: 48.861, lon: 2.341 },
      fuel: 'Gazole' as FuelType,
      price: 2.0,
      updatedAt: new Date('2026-08-03T09:00:00Z')
    }

    const stop = scheduleSyncPrices({
      db: dbHandle.db,
      provider: makeProvider([station]),
      intervalHours: 1
    })

    await vi.advanceTimersByTimeAsync(HOUR_MS)

    const meta = createSyncMetaRepository(dbHandle.db)
    const last = await meta.get()
    expect(last).toBeDefined()
    expect(last?.source).toBe('opendatasoft-api')
    expect(last?.syncedAt).toBeInstanceOf(Date)
    stop()
  })

  it('le job exposé est cohérent avec la planification (même résultat synced_at)', async () => {
    dbHandle = createTestDb()
    vi.useFakeTimers()
    const now = new Date('2026-08-03T12:00:00Z')
    const job = createSyncPricesJob({ db: dbHandle.db, provider: makeProvider(), now: () => now })
    const result = await job.run()
    expect(result.syncedAt).toEqual(now)
  })
})
