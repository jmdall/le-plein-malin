// server/api/vehicle-profile.get.ts — GET /api/vehicle-profile (ticket 013,
// spec §5.4 VEH-1/VEH-3/VEH-4). Retourne le profil véhicule singleton
// (table vehicle_profile, 006) ; un profil par défaut est créé si absent
// (jamais bloquant). Sans compte utilisateur. Aucune position stockée.
import { createDb } from '../db/client'
import { isApiError } from '../lib/orchestration'
import { createVehicleProfileRepository } from '../repositories/vehicleProfile'

export default defineEventHandler(async () => {
  const { db, sqlite } = createDb()
  try {
    const repo = createVehicleProfileRepository(db)
    const row = await repo.get()

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
