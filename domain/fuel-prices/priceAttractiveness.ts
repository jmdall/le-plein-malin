// domain/fuel-prices/priceAttractiveness.ts — Attractivité d'un prix par
// rapport à la référence du rayon (dégradé des marqueurs de la carte,
// docs/design/ui-reference.md §4 « la couleur du liseré/fond encode le prix »).
// Module pur : aucune dépendance Nuxt/HTTP/SQLite (ticket 002).
//
// Principe : le prix d'une station est comparé à celui de la station de
// référence (la plus proche du centre). L'écart est ramené sur une bande
// bornée ±15 % autour du prix de référence, interpolée linéairement :
//   0  = le prix le plus cher de la bande (terracotta, « Plus cher ») ;
//   1  = le prix le moins cher de la bande (vert, « Moins cher ») ;
//   0,5 = un prix égal à la référence (milieu du dégradé).
// Toute valeur hors bande est saturée à 0 ou 1 : le dégradé reste lisible
// même avec un prix extrême, et aucun seuil « rupture » arbitraire n'est
// inventé (REC-2/D1 : le module ne recale rien, il présente seulement).
export const PRICE_ATTRACTIVENESS_BAND_FRACTION = 0.15

export interface PriceAttractivenessBand {
  /** Prix le plus bas de la bande (attractivité 1). */
  min: number
  /** Prix le plus haut de la bande (attractivité 0). */
  max: number
}

export function computePriceAttractivenessBand(
  referencePrice: number,
  bandFraction: number = PRICE_ATTRACTIVENESS_BAND_FRACTION
): PriceAttractivenessBand {
  assertValidBandFraction(bandFraction)
  return {
    min: referencePrice * (1 - bandFraction),
    max: referencePrice * (1 + bandFraction)
  }
}

function assertValidBandFraction(bandFraction: number): void {
  if (!Number.isFinite(bandFraction) || bandFraction <= 0 || bandFraction >= 0.5) {
    throw new RangeError(`bandFraction doit être dans (0, 0.5), reçu ${bandFraction}`)
  }
}

/** Interpolation linéaire de la bande → [0, 1], saturée hors bande. */
export function computePriceAttractiveness(input: {
  referencePrice: number
  price: number
  bandFraction?: number
}): number {
  const bandFraction = input.bandFraction ?? PRICE_ATTRACTIVENESS_BAND_FRACTION
  assertValidBandFraction(bandFraction)
  const { min, max } = computePriceAttractivenessBand(input.referencePrice, bandFraction)
  const width = max - min
  if (width <= 0) return 0
  // ratio 0 = max (cher) → attractivité 0 ; ratio 1 = min (moins cher) → 1.
  const ratio = Math.min(1, Math.max(0, (max - input.price) / width))
  return ratio
}
