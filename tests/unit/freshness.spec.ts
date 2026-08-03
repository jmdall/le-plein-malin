import { describe, expect, it } from 'vitest'
import { computeFreshness } from '../../domain/fuel-prices/freshness'

// Règles de fraîcheur (spec §6, CONTEXT.md) : fresh ≤ 24 h, stale 24–48 h,
// obsolete > 48 h. Score décroissant 0..1 : 1 jusqu'à 24 h, puis linéaire
// jusqu'à 0 à 48 h (spec TRE-5).
const NOW = new Date('2026-08-03T12:00:00.000Z')
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR_MS)
}

describe('computeFreshness', () => {
  it('prix à jour → age 0, fresh, score 1', () => {
    expect(computeFreshness(new Date(NOW.getTime()), NOW)).toEqual({
      ageInHours: 0,
      status: 'fresh',
      score: 1
    })
  })

  it('24 h pile → fresh, score 1 (borne inclusive)', () => {
    const info = computeFreshness(hoursAgo(24), NOW)
    expect(info.ageInHours).toBeCloseTo(24, 6)
    expect(info.status).toBe('fresh')
    expect(info.score).toBe(1)
  })

  it('24 h + 1 min → stale, score < 1', () => {
    const updatedAt = new Date(NOW.getTime() - 24 * HOUR_MS - MINUTE_MS)
    const info = computeFreshness(updatedAt, NOW)
    expect(info.status).toBe('stale')
    expect(info.score).toBeLessThan(1)
  })

  it('48 h pile → stale, score 0 (borne inclusive)', () => {
    const info = computeFreshness(hoursAgo(48), NOW)
    expect(info.ageInHours).toBeCloseTo(48, 6)
    expect(info.status).toBe('stale')
    expect(info.score).toBe(0)
  })

  it('48 h + 1 min → obsolete, score 0', () => {
    const updatedAt = new Date(NOW.getTime() - 48 * HOUR_MS - MINUTE_MS)
    const info = computeFreshness(updatedAt, NOW)
    expect(info.status).toBe('obsolete')
    expect(info.score).toBe(0)
  })

  it('score décroissant entre 24 h et 48 h', () => {
    const score25h = computeFreshness(hoursAgo(25), NOW).score
    const score30h = computeFreshness(hoursAgo(30), NOW).score
    expect(score25h).toBeCloseTo(1 - 1 / 24, 6)
    expect(score30h).toBeCloseTo(1 - 6 / 24, 6)
    expect(score30h).toBeLessThan(score25h)
  })
})
