// tests/unit/provider-chain.spec.ts — Chaîne de repli unique paramétrée par
// rayon (ticket 028, ADR-0003, recherche §13). La règle « rayon → ordre des
// sources » vit ici, plus dans les routes : `radiusKm ≤ 100` → records d'abord
// (API paginée rapide et précise), `radiusKm > 100` (France entière) → export
// JSON complet d'abord (la pagination est plafonnée à 3000 records/carburant,
// insuffisante pour ~73 493 records).
import { describe, expect, it, vi, afterEach } from 'vitest'
import { createProviderChain, resolveProviderOrder } from '../../server/providers/providerChain'
import type { Db } from '../../server/db/client'
import type {
  FuelPriceProvider,
  NearbyStationQuery,
  ProviderResult
} from '../../server/providers/types'

const QUERY: NearbyStationQuery = {
  center: { lat: 48.861, lon: 2.341 },
  radiusKm: 10,
  fuel: 'Gazole'
}

const FAKE_STATIONS: ProviderResult = {
  stations: [],
  source: 'cache',
  syncedAt: new Date('2026-08-03T09:00:00Z')
}

function stubProvider(name: string, calls: string[]): FuelPriceProvider {
  return {
    name,
    findNearbyStations: async () => {
      calls.push(name)
      throw new Error(`KO ${name}`)
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveProviderOrder (règle rayon → ordre des sources, ADR-0003 §13)', () => {
  it('rayon ≤ 100 : records d\'abord (API → export → roulez-eco → cache)', () => {
    expect(resolveProviderOrder(10)).toEqual(['opendatasoft', 'export', 'roulezoeco', 'cache'])
  })

  it('rayon = 100 : records d\'abord (borne inclusive)', () => {
    expect(resolveProviderOrder(100)).toEqual(['opendatasoft', 'export', 'roulezoeco', 'cache'])
  })

  it('rayon > 100 (France entière) : export d\'abord (API → export → roulez-eco → cache)', () => {
    expect(resolveProviderOrder(101)).toEqual(['export', 'opendatasoft', 'roulezoeco', 'cache'])
  })

  it('rayon = 900 (France entière) : export d\'abord', () => {
    expect(resolveProviderOrder(900)).toEqual(['export', 'opendatasoft', 'roulezoeco', 'cache'])
  })
})

describe('createProviderChain (chaîne unique consommée par les routes)', () => {
  it('retourne une chaîne de repli nommée "fallback-chain"', () => {
    const chain = createProviderChain({} as Db, 10)
    expect(chain.name).toBe('fallback-chain')
  })

  it('rayon ≤ 100 : appelle les providers dans l\'ordre records-first', async () => {
    const calls: string[] = []
    const chain = createProviderChain({} as Db, 10, {
      providers: [
        stubProvider('opendatasoft', calls),
        stubProvider('export', calls),
        stubProvider('roulezoeco', calls),
        stubProvider('cache', calls)
      ]
    })
    await expect(chain.findNearbyStations(QUERY)).rejects.toThrow(/Toutes les sources/)
    expect(calls).toEqual(['opendatasoft', 'export', 'roulezoeco', 'cache'])
  })

  it('rayon > 100 : appelle les providers dans l\'ordre export-first', async () => {
    const calls: string[] = []
    const chain = createProviderChain({} as Db, 900, {
      providers: [
        stubProvider('opendatasoft', calls),
        stubProvider('export', calls),
        stubProvider('roulezoeco', calls),
        stubProvider('cache', calls)
      ]
    })
    await expect(chain.findNearbyStations(QUERY)).rejects.toThrow(/Toutes les sources/)
    expect(calls).toEqual(['export', 'opendatasoft', 'roulezoeco', 'cache'])
  })

  it('repli réel : une source qui réussit met fin à la chaîne', async () => {
    const chain = createProviderChain({} as Db, 10, {
      providers: [
        stubProvider('opendatasoft', []),
        {
          name: 'export',
          findNearbyStations: async () => FAKE_STATIONS
        }
      ]
    })
    const result = await chain.findNearbyStations(QUERY)
    expect(result).toEqual(FAKE_STATIONS)
  })

  it('logge chaque source indisponible avec un préfixe neutre [provider-chain]', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = createProviderChain({} as Db, 10, {
      providers: [
        stubProvider('opendatasoft', []),
        stubProvider('export', [])
      ]
    })
    await expect(chain.findNearbyStations(QUERY)).rejects.toThrow(/Toutes les sources/)
    expect(errorSpy).toHaveBeenCalledTimes(2)
    const firstCall = errorSpy.mock.calls[0]!
    expect(firstCall[0]).toBe('[provider-chain] provider opendatasoft indisponible :')
  })
})
