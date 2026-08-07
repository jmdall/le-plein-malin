// server/api/vehicle-profile.put.ts — PUT /api/vehicle-profile (ticket 013,
// spec §5.4 VEH-1/VEH-2). Met à jour le singleton vehicle_profile (006).
// Validation Zod stricte (consumption > 0, capacité > 0, 0 ≤ niveau ≤
// capacité, fuel ∈ 6, quantité ≥ 0, seuil ≥ 0 — défaut 1). Aucun compte,
// aucune position stockée. Retourne le profil enregistré.
import { createDb } from '../db/client'
import { createApiError, isApiError } from '../lib/api-errors'
import { createVehicleProfileRepository } from '../repositories/vehicleProfile'
import { vehicleProfileSchema } from '../lib/validation'

export default defineEventHandler(async (event) => {
  const { db, sqlite } = createDb()
  try {
    const body = await readBody(event).catch(() => null)
    const parsed = vehicleProfileSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      throw createApiError(400, 'VALIDATION_ERROR', first?.message ?? 'Profil véhicule invalide')
    }

    const repo = createVehicleProfileRepository(db)
    const row = await repo.put({
      fuel: parsed.data.fuel,
      consumption: parsed.data.consumption,
      tankCapacity: parsed.data.tankCapacity,
      currentLevel: parsed.data.currentLevel,
      preferredQuantity: parsed.data.preferredQuantity,
      savingsThreshold: parsed.data.savingsThreshold
    })

    return {
      profile: {
        fuel: row.fuel,
        consumption: row.consumption,
        tankCapacity: row.tankCapacity,
        currentLevel: row.currentLevel,
        preferredQuantity: row.preferredQuantity,
        savingsThreshold: row.savingsThreshold,
        updatedAt: row.updatedAt.toISOString()
      }
    }
  } catch (error) {
    if (isApiError(error)) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.body.error.message, data: error.body })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw createError({ statusCode: 500, statusMessage: message, data: { error: { code: 'INTERNAL_ERROR', message } } })
  } finally {
    sqlite.close()
  }
})
