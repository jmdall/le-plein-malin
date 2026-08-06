// tests/unit/stations-list.spec.ts — Réponse enrichie de GET /api/stations
// (ticket 011, spec §5.3 STA-1). Le serveur fournit distance (haversine D3),
// fraîcheur (rules 24/48 h) et grandeurs d'économie (formules CONTEXT.md) ;
// le client ne recalcule rien. La référence est marquée isReference.
import { describe, expect, it } from 'vitest'
import { buildStationsList } from '../../server/lib/orchestration'
import type { FuelPriceProvider } from '../../server/providers/types'
import type { StationPrice, FuelType } from '../../domain/fuel-prices/types'

const NOW = new Date('2026-08-03T12:00:00Z')

function station(id: string, overrides: Partial<StationPrice> = {}): StationPrice {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    address: `adresse ${id}`,
    city: 'PARIS',
    postalCode: '75001',
    position: { lat: 48.861, lon: 2.341 },
    fuel: 'Gazole',
    price: 2.0,
    updatedAt: NOW,
    ...overrides
  }
}

function localProvider(stations: StationPrice[]): FuelPriceProvider {
  return {
    name: 'test-provider',
    async findNearbyStations() {
      return { stations, source: 'cache', syncedAt: NOW }
    }
  }
}

const CENTER = { mode: 'geo' as const, lat: 48.861, lon: 2.341 }
const VEHICLE = { consumption: 6, currentLevel: 20, tankCapacity: 60 }

describe('buildStationsList (ticket 011, STA-1)', () => {
  it('chaque station porte distance, fraîcheur et économies ; la plus proche est la référence', async () => {
    const stations = [
      station('a', { position: { lat: 48.861, lon: 2.341 }, price: 2.0 }), // centre
      station('b', { position: { lat: 48.871, lon: 2.351 }, price: 1.9 })
    ]
    const res = await buildStationsList({
      provider: localProvider(stations),
      query: { radius: 10, fuel: 'Gazole' as FuelType },
      center: CENTER,
      vehicle: VEHICLE,
      now: () => NOW
    })

    expect(res.referenceStation?.id).toBe('a')

    const ref = res.stations.find((s) => s.id === 'a')!
    expect(ref.isReference).toBe(true)
    expect(ref.distanceKm).toBeCloseTo(0, 6)
    // La référence n'a pas d'économie : elle est le point de comparaison.
    expect(ref.economics).toEqual({ detourCost: null, grossSavings: null, netSavings: null })
    // Pas d'attractivité non plus : la référence n'est pas une alternative.
    expect(ref.attractiveness).toBeNull()
    expect(ref.freshness.status).toBe('fresh')

    const cand = res.stations.find((s) => s.id === 'b')!
    expect(cand.isReference).toBe(false)
    expect(cand.distanceKm).toBeGreaterThan(0)
    // Attractivité du prix : bande ±15 % autour de 2,0 → [1,7 ; 2,3] ;
    // 1,9 est moins cher que la référence → (2,3 − 1,9)/(2,3 − 1,7) = 0,667.
    expect(cand.attractiveness).toBeCloseTo(2 / 3, 6)
    // Économie brute = (2,0 − 1,9) × 40 = 4 € ; coût du détour = détour A/R × conso/100 × prix.
    const dist = cand.distanceKm
    const detour = Math.max(0, dist - ref.distanceKm) * 2
    expect(cand.economics.grossSavings).toBeCloseTo((2.0 - 1.9) * 40, 6)
    expect(cand.economics.detourCost).toBeCloseTo(detour * (6 / 100) * 1.9, 6)
    expect(cand.economics.netSavings).toBeCloseTo((cand.economics.grossSavings ?? 0) - (cand.economics.detourCost ?? 0), 6)
  })

  it('sans profil véhicule, les économies ne sont pas calculées (pas de quantité inventée)', async () => {
    const stations = [
      station('a', { position: { lat: 48.861, lon: 2.341 } }),
      station('b', { position: { lat: 48.871, lon: 2.351 } })
    ]
    const res = await buildStationsList({
      provider: localProvider(stations),
      query: { radius: 10, fuel: 'Gazole' as FuelType },
      center: CENTER,
      now: () => NOW
    })

    for (const s of res.stations) {
      expect(s.economics).toEqual({ detourCost: null, grossSavings: null, netSavings: null })
    }
  })

  it('fraîcheur : ≤ 24 h frais, 24–48 h atténué, > 48 h obsolète (toujours présent)', async () => {
    const fresh = station('fresh', {
      position: { lat: 48.861, lon: 2.341 },
      updatedAt: new Date(NOW.getTime() - 2 * 3_600_000)
    })
    const stale = station('stale', {
      position: { lat: 48.87, lon: 2.35 },
      updatedAt: new Date(NOW.getTime() - 30 * 3_600_000)
    })
    const obsolete = station('obsolete', {
      position: { lat: 48.88, lon: 2.36 },
      updatedAt: new Date(NOW.getTime() - 60 * 3_600_000)
    })

    const res = await buildStationsList({
      provider: localProvider([obsolete, stale, fresh]),
      query: { radius: 30, fuel: 'Gazole' as FuelType },
      center: { mode: 'geo', lat: 48.86, lon: 2.34 },
      vehicle: VEHICLE,
      now: () => NOW
    })

    const byId = (id: string) => res.stations.find((s) => s.id === id)!
    expect(byId('fresh').freshness.status).toBe('fresh')
    expect(byId('stale').freshness.status).toBe('stale')
    expect(byId('obsolete').freshness.status).toBe('obsolete')
    expect(res.stations).toHaveLength(3) // obsolète toujours visible (FRE-3)
    expect(byId('obsolete').economics.netSavings).toBeTypeOf('number')
  })

  it('enrichissement 020 : brand/brandWikidataId/logoUrl voyagent quand présents, null sinon', async () => {
    const enriched = station('e', {
      name: 'Station Total Réelle',
      brand: 'TotalEnergies',
      brandWikidataId: 'Q154037',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg',
      position: { lat: 48.861, lon: 2.341 }
    })
    const bare = station('b', { position: { lat: 48.871, lon: 2.351 } })
    const res = await buildStationsList({
      provider: localProvider([enriched, bare]),
      query: { radius: 10, fuel: 'Gazole' as FuelType },
      center: CENTER,
      now: () => NOW
    })

    const byId = (id: string) => res.stations.find((s) => s.id === id)!
    // Présence : les champs réels de la source (OSM) sont exposés tels quels.
    expect(byId('e').name).toBe('Station Total Réelle')
    expect(byId('e').brand).toBe('TotalEnergies')
    expect(byId('e').brandWikidataId).toBe('Q154037')
    expect(byId('e').logoUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg')
    // Absence : null, jamais inventés (REC-2/D1).
    expect(byId('b').brand).toBeNull()
    expect(byId('b').brandWikidataId).toBeNull()
    expect(byId('b').logoUrl).toBeNull()

    // Attribution OSM exposée pour l'UI (ticket 020, constante 019).
    expect(res.attribution).toEqual({ source: 'OpenStreetMap (ODbL)' })
  })
})
