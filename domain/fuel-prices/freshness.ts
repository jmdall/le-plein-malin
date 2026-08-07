import type { FreshnessInfo } from './types'

export const FRESH_LIMIT_HOURS = 24
export const OBSOLETE_LIMIT_HOURS = 48

const HOUR_MS = 3_600_000

// Score de fraîcheur 0..1 (TRE-5) : 1 tant que l'information a moins de 24 h,
// linéairement décroissant entre 24 et 48 h, 0 au-delà. Seule source des
// seuils 24/48 h : la tendance et la recommandation consomment ce score.
export function computeFreshnessScore(ageInHours: number): number {
  if (ageInHours <= FRESH_LIMIT_HOURS) {
    return 1
  }

  if (ageInHours <= OBSOLETE_LIMIT_HOURS) {
    return 1 - (ageInHours - FRESH_LIMIT_HOURS) / (OBSOLETE_LIMIT_HOURS - FRESH_LIMIT_HOURS)
  }

  return 0
}

export function computeFreshness(updatedAt: Date, now: Date): FreshnessInfo {
  const ageInHours = (now.getTime() - updatedAt.getTime()) / HOUR_MS
  const score = computeFreshnessScore(ageInHours)

  if (ageInHours <= FRESH_LIMIT_HOURS) {
    return { ageInHours, status: 'fresh', score }
  }

  if (ageInHours <= OBSOLETE_LIMIT_HOURS) {
    return { ageInHours, status: 'stale', score }
  }

  return { ageInHours, status: 'obsolete', score }
}
