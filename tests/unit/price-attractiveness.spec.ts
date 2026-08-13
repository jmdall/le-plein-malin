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
  PRICE_ATTRACTIVENESS_BAND_FRACTION,
  computeVisiblePriceScale,
  computeAttractivenessInScale
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

// ——— Ticket 039 : échelle sur la distribution VISIBLE ———
// En exploration libre il n'y a pas de station de référence : la couleur se base
// sur les prix actuellement affichés. Déciles (p10→p90) et non min/max — une
// seule station aberrante écraserait sinon tout le dégradé sur une extrémité.
describe('computeVisiblePriceScale (ticket 039)', () => {
  it('null sans aucun prix : pas d’échelle inventée', () => {
    expect(computeVisiblePriceScale([])).toBeNull()
  })

  it('null quand aucun prix n’est exploitable', () => {
    expect(computeVisiblePriceScale([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull()
  })

  it('un seul prix : échelle dégénérée mais définie (low = high)', () => {
    const scale = computeVisiblePriceScale([1.8])
    expect(scale).not.toBeNull()
    expect(scale!.low).toBe(1.8)
    expect(scale!.high).toBe(1.8)
  })

  it('bâtit l’échelle sur les déciles, pas sur les extrêmes', () => {
    // 1,50 et 3,00 sont des valeurs aberrantes isolées ; le cœur est 1,7…1,9.
    const prices = [1.5, 1.7, 1.72, 1.75, 1.78, 1.8, 1.82, 1.85, 1.88, 1.9, 3.0]
    const scale = computeVisiblePriceScale(prices)!
    expect(scale.low).toBeGreaterThan(1.5)
    expect(scale.high).toBeLessThan(3.0)
  })

  it('ignore les valeurs non finies sans planter', () => {
    const scale = computeVisiblePriceScale([1.7, Number.NaN, 1.9, Number.POSITIVE_INFINITY])!
    expect(Number.isFinite(scale.low)).toBe(true)
    expect(Number.isFinite(scale.high)).toBe(true)
  })

  it('l’ordre d’entrée n’a aucune influence', () => {
    const a = computeVisiblePriceScale([1.7, 1.8, 1.9, 2.0])!
    const b = computeVisiblePriceScale([2.0, 1.9, 1.7, 1.8])!
    expect(a).toEqual(b)
  })
})

describe('computeAttractivenessInScale (ticket 039)', () => {
  const scale = { low: 1.7, high: 1.9 }

  // Même convention que computePriceAttractiveness : 1 = moins cher (vert).
  it('1 pour le bas de l’échelle, 0 pour le haut', () => {
    expect(computeAttractivenessInScale(1.7, scale)).toBe(1)
    expect(computeAttractivenessInScale(1.9, scale)).toBe(0)
  })

  it('0,5 au milieu de l’échelle', () => {
    expect(computeAttractivenessInScale(1.8, scale)).toBeCloseTo(0.5, 10)
  })

  it('sature hors de l’échelle, jamais de valeur hors [0,1]', () => {
    expect(computeAttractivenessInScale(1.2, scale)).toBe(1)
    expect(computeAttractivenessInScale(3.5, scale)).toBe(0)
  })

  it('échelle dégénérée (low = high) → milieu neutre, pas une division par zéro', () => {
    expect(computeAttractivenessInScale(1.8, { low: 1.8, high: 1.8 })).toBe(0.5)
  })

  it('null pour un prix non exploitable : aucune couleur inventée', () => {
    expect(computeAttractivenessInScale(Number.NaN, scale)).toBeNull()
  })

  it('monotone décroissant : plus cher ⇒ moins vert', () => {
    const a = computeAttractivenessInScale(1.72, scale)!
    const b = computeAttractivenessInScale(1.8, scale)!
    const c = computeAttractivenessInScale(1.88, scale)!
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })
})
