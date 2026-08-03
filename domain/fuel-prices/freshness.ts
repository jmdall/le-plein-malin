import type { FreshnessInfo } from './types'

export const FRESH_LIMIT_HOURS = 24
export const OBSOLETE_LIMIT_HOURS = 48

const HOUR_MS = 3_600_000

export function computeFreshness(updatedAt: Date, now: Date): FreshnessInfo {
  const ageInHours = (now.getTime() - updatedAt.getTime()) / HOUR_MS

  if (ageInHours <= FRESH_LIMIT_HOURS) {
    return { ageInHours, status: 'fresh', score: 1 }
  }

  if (ageInHours <= OBSOLETE_LIMIT_HOURS) {
    const score = 1 - (ageInHours - FRESH_LIMIT_HOURS) / (OBSOLETE_LIMIT_HOURS - FRESH_LIMIT_HOURS)
    return { ageInHours, status: 'stale', score }
  }

  return { ageInHours, status: 'obsolete', score: 0 }
}
