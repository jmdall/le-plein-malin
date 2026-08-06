// tests/unit/price-attractiveness.spec.ts — Attractivité d'un prix par rapport
// à la référence du rayon (module pur). La bande de prix du dégradé des
// marqueurs de la carte (docs/design/ui-reference.md §4) : étendue bornée
// ±15 % autour du prix de la station de référence, interpolée
// linéairement de 0 (le plus cher de la bande) à 1 (le moins cher).
// Aucune dépendance Nuxt/HTTP/SQLite (ticket 002).
import { describe, expect, it } from 'vitest'
import {
  computePriceAttractiveness,
  computePriceAttractivenessBand,
  PRICE_ATTRACTIVENESS_BAND_FRACTION
} from '../../domain/fuel-prices/priceAttractiveness'

describe('computePriceAttractiveness (module pur)', () => {
  it('interpole linéairement entre les deux bornes de la bande', () => {
    const mid = computePriceAttractiveness({ referencePrice: 2.0, price: 2.0, bandFraction: 0.15 })
    expect(mid).toBeCloseTo(0.5, 6)

    const cheap = computePriceAttractiveness({ referencePrice: 2.0, price: 1.7, bandFraction: 0.15 })
    expect(cheap).toBeCloseTo(1, 6)

    const expensive = computePriceAttractiveness({ referencePrice: 2.0, price: 2.3, bandFraction: 0.15 })
    expect(expensive).toBeCloseTo(0, 6)
  })

  it('est bornée dans [0, 1] (toute valeur hors bande est saturée)', () => {
    const below = computePriceAttractiveness({ referencePrice: 2.0, price: 1.0, bandFraction: 0.15 })
    const above = computePriceAttractiveness({ referencePrice: 2.0, price: 3.0, bandFraction: 0.15 })
    expect(below).toBe(1)
    expect(above).toBe(0)
  })

  it('est exactement 1 au prix minimum de la bande et 0 au maximum', () => {
    expect(computePriceAttractiveness({ referencePrice: 2.0, price: 2.0 * 0.85, bandFraction: 0.15 })).toBe(1)
    expect(computePriceAttractiveness({ referencePrice: 2.0, price: 2.0 * 1.15, bandFraction: 0.15 })).toBe(0)
  })

  it('prix égal à la référence = 0,5 (milieu exact du dégradé)', () => {
    expect(computePriceAttractiveness({ referencePrice: 2.4, price: 2.4, bandFraction: 0.15 })).toBeCloseTo(0.5, 6)
  })

  it('la largeur de bande est configurable (bandFraction)', () => {
    // Référence 2,0 ; bande étroite (1 %) : [1,98 ; 2,02] — 1,99 est à 75 %
    // du chemin vers le moins cher.
    expect(computePriceAttractiveness({ referencePrice: 2.0, price: 1.99, bandFraction: 0.01 })).toBeCloseTo(0.75, 6)
    // Bande large (20 %) : [1,60 ; 2,40] — 1,99 est à 0,5125.
    expect(computePriceAttractiveness({ referencePrice: 2.0, price: 1.99, bandFraction: 0.2 })).toBeCloseTo(0.5125, 4)
  })

  it('préserve le sens : un prix moins cher ⇒ attractivité strictement plus haute', () => {
    const a = computePriceAttractiveness({ referencePrice: 2.0, price: 1.8, bandFraction: 0.15 })
    const b = computePriceAttractiveness({ referencePrice: 2.0, price: 1.9, bandFraction: 0.15 })
    expect(a).toBeGreaterThan(b)
  })

  it('rejette une largeur de bande invalide (trop grande ou négative)', () => {
    expect(() => computePriceAttractiveness({ referencePrice: 2.0, price: 2.0, bandFraction: 0 })).toThrow(RangeError)
    expect(() => computePriceAttractiveness({ referencePrice: 2.0, price: 2.0, bandFraction: -0.1 })).toThrow(RangeError)
    expect(() => computePriceAttractiveness({ referencePrice: 2.0, price: 2.0, bandFraction: 0.5 })).toThrow(RangeError)
  })
})

describe('computePriceAttractivenessBand (module pur)', () => {
  it('la bande par défaut s’étend à ±15 % de la référence', () => {
    const band = computePriceAttractivenessBand(2.0)
    expect(band).toEqual({
      min: 2.0 * (1 - PRICE_ATTRACTIVENESS_BAND_FRACTION),
      max: 2.0 * (1 + PRICE_ATTRACTIVENESS_BAND_FRACTION)
    })
    expect(PRICE_ATTRACTIVENESS_BAND_FRACTION).toBe(0.15)
  })

  it('s’étend à ±fraction selon le paramètre', () => {
    const band = computePriceAttractivenessBand(2.0, 0.2)
    expect(band.min).toBeCloseTo(2.0 * 0.8, 6)
    expect(band.max).toBeCloseTo(2.0 * 1.2, 6)
  })
})
