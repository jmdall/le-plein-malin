import { describe, expect, it } from 'vitest'
import { haversineKm } from '../../domain/fuel-prices/haversine'
import type { GeoPoint } from '../../domain/fuel-prices/types'

// Coordonnées de référence (tolérance documentée : ±2 km sur ~12 km) :
// Gennevilliers (mairie, 48.9333 N / 2.3000 E) → Paris 13e (48.8320 N / 2.3560 E)
// ≈ 12,0 km à vol d'oiseau (D3, ADR-0002 — haversine, pas de routage).
const gennevilliers: GeoPoint = { lat: 48.9333, lon: 2.3 }
const paris13e: GeoPoint = { lat: 48.832, lon: 2.356 }

describe('haversineKm', () => {
  it('renvoie 0 km pour deux points identiques', () => {
    expect(haversineKm(gennevilliers, gennevilliers)).toBe(0)
  })

  it('mesure Gennevilliers–Paris à ~12 km (tolérance ±2 km)', () => {
    const distance = haversineKm(gennevilliers, paris13e)
    expect(distance).toBeGreaterThan(10)
    expect(distance).toBeLessThan(14)
  })

  it('est symétrique : l\'ordre des points ne change pas le résultat', () => {
    const direct = haversineKm(gennevilliers, paris13e)
    const inverse = haversineKm(paris13e, gennevilliers)
    expect(direct).toBeCloseTo(inverse, 10)
  })
})
