import { describe, expect, it } from 'vitest'
import { calculateTrendIndicators } from '../../domain/trend/calculateTrend'
import type { TrendInput } from '../../domain/trend/types'

// Seam unique : calculateTrendIndicators (module pur domain/trend, ticket 005).
// L'historique est fourni en entrée (ADR-0004) ; le module ne lit jamais la
// base et n'importe rien de Nuxt/HTTP/SQLite/env. Tous les attendus sont des
// littéraux indépendants (indépendance de la source de vérité).
// Fenêtres : variation 24 h (J−1) et 7 j (J−7) calculées depuis le dernier
// snapshot observé (ADR-0004) ; tendance `insufficient` si J−1 ou J−7 absent.

function snapshots(
  stationId: string,
  fuel: string,
  entries: Array<{ day: string; price: number }>
): TrendInput {
  return {
    stationId,
    fuel,
    now: new Date('2026-08-03T12:00:00.000Z'),
    snapshots: entries.map((e) => ({ day: new Date(`${e.day}T00:00:00.000Z`), price: e.price }))
  }
}

// Historique 7 j (07-27 → 08-02) : indicateurs de position (min/moy/médiane/
// écart). Médiane impaire = 5e valeur triée.
const STABLE7 = snapshots('s1', 'Gazole', [
  { day: '2026-07-27', price: 1.74 },
  { day: '2026-07-28', price: 1.72 },
  { day: '2026-07-29', price: 1.74 },
  { day: '2026-07-30', price: 1.74 },
  { day: '2026-07-31', price: 1.72 },
  { day: '2026-08-01', price: 1.74 },
  { day: '2026-08-02', price: 1.74 }
])

// Historique 8 j (07-26 → 08-02) plat : J−1 et J−7 disponibles, tendance stable.
const FLAT8 = snapshots('s12', 'Gazole', [
  { day: '2026-07-26', price: 1.74 },
  { day: '2026-07-27', price: 1.74 },
  { day: '2026-07-28', price: 1.74 },
  { day: '2026-07-29', price: 1.74 },
  { day: '2026-07-30', price: 1.74 },
  { day: '2026-07-31', price: 1.74 },
  { day: '2026-08-01', price: 1.74 },
  { day: '2026-08-02', price: 1.74 }
])

// Série montante 8 j (07-26 → 08-02) : 1.69 → 1.74.
const RISING = snapshots('s6', 'Gazole', [
  { day: '2026-07-26', price: 1.69 },
  { day: '2026-07-27', price: 1.7 },
  { day: '2026-07-28', price: 1.7 },
  { day: '2026-07-29', price: 1.71 },
  { day: '2026-07-30', price: 1.71 },
  { day: '2026-07-31', price: 1.72 },
  { day: '2026-08-01', price: 1.73 },
  { day: '2026-08-02', price: 1.74 }
])

// Série descendante 8 j (07-26 → 08-02) : 1.75 → 1.70.
const FALLING = snapshots('s7', 'Gazole', [
  { day: '2026-07-26', price: 1.75 },
  { day: '2026-07-27', price: 1.74 },
  { day: '2026-07-28', price: 1.74 },
  { day: '2026-07-29', price: 1.73 },
  { day: '2026-07-30', price: 1.72 },
  { day: '2026-07-31', price: 1.72 },
  { day: '2026-08-01', price: 1.71 },
  { day: '2026-08-02', price: 1.7 }
])

describe('calculateTrendIndicators — prix locaux', () => {
  it('prix minimum local', () => {
    expect(calculateTrendIndicators(STABLE7).minPrice).toBe(1.72)
  })

  it('prix moyen (moyenne arithmétique)', () => {
    // (1.74+1.72+1.74+1.74+1.72+1.74+1.74)/7 = 12.14/7
    expect(calculateTrendIndicators(STABLE7).averagePrice).toBeCloseTo(1.734285714, 6)
  })

  it('prix médian (médiane impaire : 4e valeur triée)', () => {
    expect(calculateTrendIndicators(STABLE7).medianPrice).toBe(1.74)
  })

  it('médiane paire : moyenne des deux valeurs centrales', () => {
    const input = snapshots('s2', 'Gazole', [
      { day: '2026-07-28', price: 1.72 },
      { day: '2026-07-29', price: 1.74 }
    ])
    expect(calculateTrendIndicators(input).medianPrice).toBeCloseTo(1.73, 6)
  })

  it('écart à la médiane (prix courant − médiane)', () => {
    const out = calculateTrendIndicators(STABLE7)
    expect(out.deviationFromMedian).toBeCloseTo(0, 6)
  })

  it('l’ordre de l’historique n’influence pas les indicateurs de position', () => {
    const input = snapshots('s3', 'Gazole', [
      { day: '2026-08-01', price: 1.9 },
      { day: '2026-07-28', price: 1.8 },
      { day: '2026-07-29', price: 1.75 },
      { day: '2026-07-27', price: 1.7 },
      { day: '2026-07-30', price: 1.85 },
      { day: '2026-07-31', price: 1.88 }
    ])
    const out = calculateTrendIndicators(input)
    expect(out.minPrice).toBe(1.7)
    // (1.7+1.8+1.75+1.85+1.88+1.9)/6 = 10.88/6
    expect(out.averagePrice).toBeCloseTo(1.813333333, 6)
    // médiane paire : triée [1.70,1.75,1.80,1.85,1.88,1.90] → (1.80+1.85)/2
    expect(out.medianPrice).toBeCloseTo(1.825, 6)
  })
})

describe('calculateTrendIndicators — variations et tendance', () => {
  it('variation 24 h (J−1) en valeur absolue et relative', () => {
    const input = snapshots('s4', 'Gazole', [
      { day: '2026-07-26', price: 1.8 },
      { day: '2026-07-27', price: 1.8 },
      { day: '2026-07-28', price: 1.8 },
      { day: '2026-07-29', price: 1.8 },
      { day: '2026-07-30', price: 1.8 },
      { day: '2026-07-31', price: 1.8 },
      { day: '2026-08-01', price: 1.8 },
      { day: '2026-08-02', price: 1.76 }
    ])
    const out = calculateTrendIndicators(input)
    expect(out.change24h).toBeCloseTo(-0.04, 6)
    expect(out.change24hPercent).toBeCloseTo(-0.04 / 1.8, 6)
    // J−7 disponible : même prix de référence 1.8
    expect(out.change7d).toBeCloseTo(-0.04, 6)
  })

  it('variation 7 j (J−7) en valeur absolue et relative', () => {
    // J−7 : snapshot le plus proche ≤ (dernier jour − 7 j) → 07-26 (1.80).
    // J−1 : snapshot le plus proche ≤ (dernier jour − 24 h) → 07-29 (1.78).
    const input = snapshots('s5', 'Gazole', [
      { day: '2026-07-26', price: 1.8 },
      { day: '2026-07-29', price: 1.78 },
      { day: '2026-08-02', price: 1.72 }
    ])
    const out = calculateTrendIndicators(input)
    expect(out.change7d).toBeCloseTo(-0.08, 6)
    expect(out.change7dPercent).toBeCloseTo(-0.08 / 1.8, 6)
    expect(out.change24h).toBeCloseTo(-0.06, 6)
    expect(out.change24hPercent).toBeCloseTo(-0.06 / 1.78, 6)
  })

  it('série stable → tendance stable, magnitude 0', () => {
    const out = calculateTrendIndicators(FLAT8)
    expect(out.trend.direction).toBe('stable')
    expect(out.trend.magnitude).toBe(0)
  })

  it('série montante → tendance up', () => {
    const out = calculateTrendIndicators(RISING)
    expect(out.trend.direction).toBe('up')
    expect(out.trend.magnitude).toBeGreaterThan(0)
  })

  it('série descendante → tendance down', () => {
    const out = calculateTrendIndicators(FALLING)
    expect(out.trend.direction).toBe('down')
    expect(out.trend.magnitude).toBeLessThan(0)
  })

  it('moins de 2 points → tendance insufficient, variations null', () => {
    const out = calculateTrendIndicators(snapshots('s13', 'Gazole', [
      { day: '2026-08-02', price: 1.74 }
    ]))
    expect(out.change24h).toBeNull()
    expect(out.change7d).toBeNull()
    expect(out.trend.direction).toBe('insufficient')
    expect(out.trend.magnitude).toBe(0)
  })

  it('pondération par ancienneté : une variation récente domine l’historique', () => {
    // Historique plat, puis hausse de 0,06 €/L sur le dernier jour.
    const input = snapshots('s11', 'Gazole', [
      { day: '2026-07-26', price: 1.7 },
      { day: '2026-07-27', price: 1.7 },
      { day: '2026-07-28', price: 1.7 },
      { day: '2026-07-29', price: 1.7 },
      { day: '2026-07-30', price: 1.7 },
      { day: '2026-07-31', price: 1.7 },
      { day: '2026-08-01', price: 1.7 },
      { day: '2026-08-02', price: 1.76 }
    ])
    const out = calculateTrendIndicators(input)
    expect(out.trend.direction).toBe('up')
    expect(out.trend.magnitude).toBeGreaterThan(0)
  })

  it('tendance de type TrendSignal compatible (down | stable | up | insufficient)', () => {
    const direction = calculateTrendIndicators(RISING).trend.direction
    expect(['down', 'stable', 'up', 'insufficient']).toContain(direction)
  })
})

describe('calculateTrendIndicators — fraîcheur', () => {
  it('score de fraîcheur 1 pour un prix du jour', () => {
    const input = snapshots('s8', 'Gazole', [
      { day: '2026-08-01', price: 1.8 },
      { day: '2026-08-03', price: 1.8 }
    ])
    expect(calculateTrendIndicators(input).freshnessScore).toBe(1)
  })

  it('score de fraîcheur 0.5 pour un prix de 24 h pile', () => {
    const input = snapshots('s9', 'Gazole', [
      { day: '2026-08-01', price: 1.8 },
      { day: '2026-08-02', price: 1.8 }
    ])
    expect(calculateTrendIndicators(input).freshnessScore).toBeCloseTo(0.5, 6)
  })

  it('score de fraîcheur 0 pour un prix de plus de 48 h', () => {
    const input = snapshots('s10', 'Gazole', [
      { day: '2026-07-31', price: 1.8 },
      { day: '2026-08-01', price: 1.8 }
    ])
    expect(calculateTrendIndicators(input).freshnessScore).toBe(0)
  })
})
