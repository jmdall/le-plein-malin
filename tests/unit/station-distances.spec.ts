// tests/unit/station-distances.spec.ts — Seam unique de résolution des
// distances centre → stations (ticket 033, ADR-0005). Quatre sites de
// api-response-builder / recommendation-input recodaient haversine ; ils passent
// tous par ici. Le repli haversine ne doit JAMAIS faire échouer une recherche.
import { describe, expect, it, vi } from 'vitest'
import { haversineKm } from '../../domain/fuel-prices/haversine'
import { resolveStationDistances } from '../../server/lib/station-distances'
import type { RouteDistanceProvider } from '../../server/providers/routeDistance'
import type { StationPrice } from '../../domain/fuel-prices/types'

const CENTER = { lat: 48.8566, lon: 2.3522 }
const NOW = new Date('2026-08-13T10:00:00Z')

function station(id: string, lat: number, lon: number): StationPrice {
  return {
    id,
    name: `Station ${id}`,
    address: '1 rue du Test',
    city: 'Paris',
    postalCode: '75001',
    position: { lat, lon },
    fuel: 'Gazole',
    price: 1.8,
    updatedAt: NOW
  }
}

const A = station('a', 48.87, 2.36)
const B = station('b', 48.85, 2.34)

function routeProvider(distances: Array<number | null>): RouteDistanceProvider {
  return {
    name: 'stub',
    tableFromOrigin: async () => distances
  }
}

describe('resolveStationDistances (ticket 033)', () => {
  it('sans provider : haversine partout, source straight-line', async () => {
    const { withDistance, source } = await resolveStationDistances({
      center: CENTER,
      stations: [A, B]
    })
    expect(source).toBe('straight-line')
    expect(withDistance[0]!.distanceKm).toBeCloseTo(haversineKm(CENTER, A.position), 6)
    expect(withDistance[1]!.distanceKm).toBeCloseTo(haversineKm(CENTER, B.position), 6)
  })

  it('toutes les distances routières connues : source road', async () => {
    const { withDistance, source } = await resolveStationDistances({
      center: CENTER,
      stations: [A, B],
      route: routeProvider([4.2, 1.5])
    })
    expect(source).toBe('road')
    expect(withDistance[0]!.distanceKm).toBe(4.2)
    expect(withDistance[1]!.distanceKm).toBe(1.5)
  })

  // La distance routière est presque toujours plus longue que la ligne droite :
  // c'est exactement ce qui était sous-estimé dans le coût du détour.
  it('la distance routière remplace bien la ligne droite (plus longue)', async () => {
    const straight = haversineKm(CENTER, A.position)
    const { withDistance } = await resolveStationDistances({
      center: CENTER,
      stations: [A],
      route: routeProvider([straight * 1.4])
    })
    expect(withDistance[0]!.distanceKm).toBeGreaterThan(straight)
  })

  it('routage partiel : les km routiers connus sont utilisés, la source reste prudente', async () => {
    const { withDistance, source } = await resolveStationDistances({
      center: CENTER,
      stations: [A, B],
      route: routeProvider([4.2, null])
    })
    // On n'annonce pas « routier » si une seule candidate ne l'est pas.
    expect(source).toBe('straight-line')
    expect(withDistance[0]!.distanceKm).toBe(4.2)
    expect(withDistance[1]!.distanceKm).toBeCloseTo(haversineKm(CENTER, B.position), 6)
  })

  it('provider en échec : repli haversine complet, aucune exception propagée', async () => {
    const failing: RouteDistanceProvider = {
      name: 'ko',
      tableFromOrigin: async () => {
        throw new Error('OSRM indisponible')
      }
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { withDistance, source } = await resolveStationDistances({
        center: CENTER,
        stations: [A, B],
        route: failing
      })
      expect(source).toBe('straight-line')
      expect(withDistance[0]!.distanceKm).toBeCloseTo(haversineKm(CENTER, A.position), 6)
      expect(withDistance).toHaveLength(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('un provider qui renvoie une longueur incohérente est ignoré (repli)', async () => {
    const { withDistance, source } = await resolveStationDistances({
      center: CENTER,
      stations: [A, B],
      route: routeProvider([4.2])
    })
    expect(source).toBe('straight-line')
    expect(withDistance[1]!.distanceKm).toBeCloseTo(haversineKm(CENTER, B.position), 6)
  })

  it('une distance routière absurde (négative, non finie) est ignorée', async () => {
    const { withDistance, source } = await resolveStationDistances({
      center: CENTER,
      stations: [A, B],
      route: routeProvider([-3, Number.NaN])
    })
    expect(source).toBe('straight-line')
    expect(withDistance[0]!.distanceKm).toBeCloseTo(haversineKm(CENTER, A.position), 6)
    expect(withDistance[1]!.distanceKm).toBeCloseTo(haversineKm(CENTER, B.position), 6)
  })

  it('aucune station : pas d’appel au provider, source straight-line', async () => {
    let called = false
    const { withDistance, source } = await resolveStationDistances({
      center: CENTER,
      stations: [],
      route: {
        name: 'stub',
        tableFromOrigin: async () => {
          called = true
          return []
        }
      }
    })
    expect(withDistance).toEqual([])
    expect(source).toBe('straight-line')
    expect(called).toBe(false)
  })

  it('conserve l’ordre et tous les champs de la station', async () => {
    const { withDistance } = await resolveStationDistances({
      center: CENTER,
      stations: [A, B],
      route: routeProvider([4.2, 1.5])
    })
    expect(withDistance.map((s) => s.id)).toEqual(['a', 'b'])
    expect(withDistance[0]!.name).toBe('Station a')
    expect(withDistance[0]!.price).toBe(1.8)
  })
})
