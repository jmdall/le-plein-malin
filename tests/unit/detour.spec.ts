import { describe, expect, it } from 'vitest'
import { computeDetourKm } from '../../domain/fuel-prices/detour'

// Détour A/R (D2 / ADR-0002) : max(0, dist_c − dist_r) × 2. Hypothèse ligne
// droite aller-retour, identique en mode géolocalisé et en mode ville/CP.
describe('computeDetourKm', () => {
  it('candidate plus loin que la référence → écart × 2', () => {
    expect(computeDetourKm(8, 5)).toBe(6)
  })

  it('candidate plus proche que la référence → 0 (pas de détour négatif)', () => {
    expect(computeDetourKm(2, 5)).toBe(0)
  })

  it('candidate à la même distance que la référence → 0', () => {
    expect(computeDetourKm(5, 5)).toBe(0)
  })
})
