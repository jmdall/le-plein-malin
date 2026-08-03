import type { TrendIndicators, TrendInput } from './types'

// domain/trend/calculateTrend.ts — ticket 005, spec §5.7 (TRE-2/TRE-3),
// ADR-0004 : tendance déterministe et explicable (moyenne, médiane,
// variations absolue/relative, pondération par ancienneté). Aucun LLM/ML.
// Module pur : l'historique arrive en entrée, jamais lu de la base.

// Seuils documentés (TRE-3) — fenêtres de comparaison (ADR-0004).
const WINDOW_24H_MS = 24 * 3_600_000
const WINDOW_7D_MS = 7 * 24 * 3_600_000

// Pondération par ancienneté pour la tendance : les observations récentes
// pèsent davantage (demi-vie de 7 jours). Déterministe et explicable.
const DECAY_HALF_LIFE_MS = 7 * 24 * 3_600_000
const DECAY_HALF_LIFE_LOG2 = Math.log(2) / DECAY_HALF_LIFE_MS

// Règles 24 h / 48 h (spec §6, TRE-5) — cohérent avec domain/fuel-prices/freshness.
const FRESH_LIMIT_MS = 24 * 3_600_000
const OBSOLETE_LIMIT_MS = 48 * 3_600_000

// Seuil relatif de stabilité : |variation relative| < 0,5 % → « stable ».
const STABLE_THRESHOLD = 0.005

export function calculateTrendIndicators(input: TrendInput): TrendIndicators {
  // Invariant CONTEXT.md « aucun prix n'est inventé » : un historique vide ne
  // peut pas produire d'indicateurs (min/moyenne/médiane/prix courant). On
  // lève une erreur explicite plutôt que de fabriquer 0/NaN (C4 revue). Les
  // appelants décident du repli (« tendance insuffisante ») AVANT l'appel.
  if (input.snapshots.length === 0) {
    throw new Error('Tendance : historique vide — indicateurs non calculables (aucun prix inventé)')
  }

  // Tri chronologique par jour : le module est déterministe et indépendant de
  // l'ordre de l'historique reçu (TRE-3).
  const snapshots = [...input.snapshots].sort(
    (a, b) => a.day.getTime() - b.day.getTime()
  )
  const prices = snapshots.map((s) => s.price)
  const sorted = [...prices].sort((a, b) => a - b)
  const n = sorted.length

  const minPrice = sorted[0] as number
  const averagePrice = prices.reduce((sum, p) => sum + p, 0) / n
  const medianPrice = median(sorted)
  // snapshots non vide garanti par la garde ci-dessus (C4 revue) : jamais 0.
  const currentPrice = snapshots[snapshots.length - 1]!.price
  const deviationFromMedian = currentPrice - medianPrice

  const change24h = variationAt(snapshots, WINDOW_24H_MS)
  const change7d = variationAt(snapshots, WINDOW_7D_MS)

  // Pondération par ancienneté (exponentielle décroissante) appliquée sur les
  // variations journalières : une tendance récente domine une variation
  // ancienne. La magnitude est cette moyenne pondérée (€/L).
  const magnitude = decayWeightedDelta(snapshots)

  // Direction classée sur la variation 24 h (J−1) — la plus récente et la plus
  // fiable — sinon sur la variation 7 j (J−7), sinon données insuffisantes.
  // La magnitude reste l'estimation pondérée par ancienneté.
  const trend =
    change24h !== null
      ? classify(change24h.rel, magnitude)
      : change7d !== null
        ? classify(change7d.rel, magnitude)
        : { direction: 'insufficient' as const, magnitude: 0 }

  return {
    minPrice,
    averagePrice,
    medianPrice,
    deviationFromMedian,
    change24h: change24h?.abs ?? null,
    change24hPercent: change24h?.rel ?? null,
    change7d: change7d?.abs ?? null,
    change7dPercent: change7d?.rel ?? null,
    trend,
    freshnessScore: computeFreshnessScore(snapshots, input.now)
  }
}

function median(sorted: number[]): number {
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : (sorted[mid] as number)
}

// Classement de la direction selon la variation relative la plus récente
// disponible : |rel| < seuil → stable, sinon hausse/baisse. La magnitude
// (€/L) est l'estimation pondérée par ancienneté, jamais une certitude.
function classify(
  rel: number,
  magnitude: number
): { direction: 'up' | 'stable' | 'down'; magnitude: number } {
  if (rel > STABLE_THRESHOLD) {
    return { direction: 'up', magnitude: Math.max(magnitude, 0) }
  }
  if (rel < -STABLE_THRESHOLD) {
    return { direction: 'down', magnitude: Math.min(magnitude, 0) }
  }
  return { direction: 'stable', magnitude: 0 }
}

interface Variation {
  abs: number
  rel: number
}

// Variation entre le prix courant et le prix à `windowMs` dans le passé
// (J−1, J−7). null si le point de comparaison est absent (TRE-4).
function variationAt(
  snapshots: TrendInput['snapshots'],
  windowMs: number
): Variation | null {
  if (snapshots.length < 2) return null
  const base = snapshots[snapshots.length - 1] as (typeof snapshots)[number]
  const target = findAtOrBefore(snapshots, base.day.getTime() - windowMs)
  if (target === null) return null
  const abs = base.price - target.price
  return { abs, rel: abs / target.price }
}

// Pondération par ancienneté : chaque variation journalière pèse d'autant plus
// qu'elle est récente (décroissance exponentielle, demi-vie 7 j). Déterministe.
function decayWeightedDelta(snapshots: TrendInput['snapshots']): number {
  if (snapshots.length < 2) return 0
  const latestMs = snapshots[snapshots.length - 1]!.day.getTime()
  let weightedSum = 0
  let totalWeight = 0
  for (let i = snapshots.length - 1; i >= 1; i--) {
    const current = snapshots[i] as (typeof snapshots)[number]
    const previous = snapshots[i - 1] as (typeof snapshots)[number]
    const delta = current.price - previous.price
    const weight = Math.exp(-DECAY_HALF_LIFE_LOG2 * (current.day.getTime() - latestMs))
    weightedSum += delta * weight
    totalWeight += weight
  }
  return totalWeight === 0 ? 0 : weightedSum / totalWeight
}

// Règles 24 h / 48 h (TRE-5) : score décroissant 0..1 — 1 jusqu'à 24 h, puis
// linéaire jusqu'à 0 à 48 h, 0 au-delà. Cohérent avec computeFreshness.
function computeFreshnessScore(
  snapshots: TrendInput['snapshots'],
  now: Date
): number {
  if (snapshots.length === 0) return 0
  const latest = snapshots[snapshots.length - 1] as (typeof snapshots)[number]
  const ageMs = now.getTime() - latest.day.getTime()
  if (ageMs <= FRESH_LIMIT_MS) return 1
  if (ageMs >= OBSOLETE_LIMIT_MS) return 0
  return 1 - (ageMs - FRESH_LIMIT_MS) / (OBSOLETE_LIMIT_MS - FRESH_LIMIT_MS)
}

// Point de l'historique le plus proche, à une date <= cible (fenêtre J−1/J−7).
function findAtOrBefore(
  snapshots: TrendInput['snapshots'],
  targetMs: number
): (typeof snapshots)[number] | null {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const s = snapshots[i] as (typeof snapshots)[number]
    if (s.day.getTime() <= targetMs) return s
  }
  return null
}
