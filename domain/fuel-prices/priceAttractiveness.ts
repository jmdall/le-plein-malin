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

// ——— Échelle sur la distribution VISIBLE (ticket 039) ———
// En exploration libre de la carte il n'y a pas de station de référence : la
// couleur d'un marqueur se situe par rapport aux prix actuellement AFFICHÉS.
//
// Conséquence assumée du choix produit : une même station change de couleur
// quand on déplace la carte. La légende doit donc parler des « stations
// visibles » — sinon la couleur devient impossible à interpréter.
//
// Déciles (p10 → p90) et non min/max : une seule station aberrante écraserait
// tout le dégradé sur une extrémité et rendrait la carte illisible.
export const VISIBLE_SCALE_LOW_PERCENTILE = 0.1
export const VISIBLE_SCALE_HIGH_PERCENTILE = 0.9

export interface VisiblePriceScale {
  /** Bas de l'échelle : attractivité 1 (le plus vert). */
  low: number
  /** Haut de l'échelle : attractivité 0. */
  high: number
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 1) return sorted[0]!
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))
  return sorted[index]!
}

// null quand aucun prix exploitable : on n'invente pas une échelle, donc pas de
// couleur (le marqueur reste neutre).
export function computeVisiblePriceScale(prices: number[]): VisiblePriceScale | null {
  const usable = prices.filter((p) => Number.isFinite(p)).sort((a, b) => a - b)
  if (usable.length === 0) return null
  return {
    low: percentile(usable, VISIBLE_SCALE_LOW_PERCENTILE),
    high: percentile(usable, VISIBLE_SCALE_HIGH_PERCENTILE)
  }
}

// Même convention que computePriceAttractiveness : 1 = moins cher (vert),
// 0 = plus cher. Saturé hors échelle, jamais hors [0, 1].
export function computeAttractivenessInScale(
  price: number,
  scale: VisiblePriceScale
): number | null {
  if (!Number.isFinite(price)) return null
  const width = scale.high - scale.low
  // Échelle dégénérée (tous les prix visibles identiques) : milieu neutre —
  // aucune station n'est « moins chère » qu'une autre.
  if (width <= 0) return 0.5
  return Math.min(1, Math.max(0, (scale.high - price) / width))
}
