// tests/unit/vehicle-profile.spec.ts — Validation Zod du profil véhicule
// (ticket 013, spec §5.4 VEH-2). Tests purs du schéma (server/lib/validation) :
// aucune règle métier testée à travers l'API.
import { describe, expect, it } from 'vitest'
import { vehicleProfileSchema } from '../../server/lib/validation'

const VALID = {
  consumption: 6,
  tankCapacity: 60,
  currentLevel: 30,
  fuel: 'Gazole',
  preferredQuantity: null,
  savingsThreshold: 1
}

describe('vehicleProfileSchema (ticket 013, VEH-2)', () => {
  it('accepte un profil complet valide', () => {
    const result = vehicleProfileSchema.safeParse(VALID)
    expect(result.success).toBe(true)
  })

  it('coerce les chaînes numériques (formulaire)', () => {
    const result = vehicleProfileSchema.safeParse({
      consumption: '6.5',
      tankCapacity: '60',
      currentLevel: '30',
      fuel: 'Gazole',
      preferredQuantity: '',
      savingsThreshold: '1'
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.consumption).toBe(6.5)
      expect(result.data.preferredQuantity).toBeNull()
    }
  })

  it('rejette une consommation ≤ 0 (§13 #12)', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, consumption: 0 })
    expect(result.success).toBe(false)
  })

  it('rejette une capacité ≤ 0', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, tankCapacity: 0 })
    expect(result.success).toBe(false)
  })

  it('rejette un niveau négatif', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, currentLevel: -1 })
    expect(result.success).toBe(false)
  })

  it('rejette un niveau supérieur à la capacité (données incohérentes, §13 #14)', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, currentLevel: 61 })
    expect(result.success).toBe(false)
  })

  it('accepte un niveau égal à la capacité', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, currentLevel: 60 })
    expect(result.success).toBe(true)
  })

  it('rejette un carburant inconnu', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, fuel: 'Benzène' })
    expect(result.success).toBe(false)
  })

  it('rejette une quantité souhaitée négative', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, preferredQuantity: -5 })
    expect(result.success).toBe(false)
  })

  it('rejette un seuil négatif', () => {
    const result = vehicleProfileSchema.safeParse({ ...VALID, savingsThreshold: -0.5 })
    expect(result.success).toBe(false)
  })

  it('applique le seuil par défaut à 1 € quand absent', () => {
    const { savingsThreshold: _unused, ...withoutThreshold } = VALID
    const result = vehicleProfileSchema.safeParse(withoutThreshold)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.savingsThreshold).toBe(1)
    }
  })
})
