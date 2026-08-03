// tests/unit/economics.spec.ts — Formules d'économie par station (ticket 011,
// spec §5.5 / CONTEXT.md). Module pur : les valeurs affichées en liste
// (économie brute, coût du détour, économie nette) viennent de l'API, qui
// utilise cette fonction unique — aucune duplication côté client (STA-1).
import { describe, expect, it } from 'vitest'
import { computeCandidateEconomics } from '../../domain/fuel-prices/economics'

describe('computeCandidateEconomics (formules CONTEXT.md)', () => {
  it('coût du détour = détour A/R × conso/100 × prix candidat ; économie brute et nette cohérentes', () => {
    const r = computeCandidateEconomics({
      referencePrice: 2.0,
      candidatePrice: 1.8,
      detourDistanceKm: 5,
      consumption: 6,
      quantity: 40
    })
    expect(r.detourCost).toBeCloseTo(5 * (6 / 100) * 1.8, 6) // 0,54 €
    expect(r.grossSavings).toBeCloseTo((2.0 - 1.8) * 40, 6) // 8,00 €
    expect(r.netSavings).toBeCloseTo(8 - 0.54, 6) // 7,46 €
  })

  it('quantité nulle → économie brute nulle, nette = −coût du détour', () => {
    const r = computeCandidateEconomics({
      referencePrice: 2.0,
      candidatePrice: 1.9,
      detourDistanceKm: 3,
      consumption: 6,
      quantity: 0
    })
    expect(r.grossSavings).toBe(0)
    expect(r.detourCost).toBeCloseTo(3 * 0.06 * 1.9, 6)
    expect(r.netSavings).toBeCloseTo(-r.detourCost, 6)
  })

  it('prix candidat plus cher que la référence → économie brute négative', () => {
    const r = computeCandidateEconomics({
      referencePrice: 1.8,
      candidatePrice: 2.0,
      detourDistanceKm: 0,
      consumption: 6,
      quantity: 40
    })
    expect(r.grossSavings).toBeCloseTo(-8, 6)
    expect(r.netSavings).toBeCloseTo(-8, 6)
  })

  it('détour nul sur le trajet → coût du détour nul (candidate jamais pénalisée, CAL-2)', () => {
    const r = computeCandidateEconomics({
      referencePrice: 2.0,
      candidatePrice: 1.9,
      detourDistanceKm: 0,
      consumption: 6,
      quantity: 50
    })
    expect(r.detourCost).toBe(0)
    expect(r.netSavings).toBeCloseTo(0.1 * 50, 6)
  })
})
