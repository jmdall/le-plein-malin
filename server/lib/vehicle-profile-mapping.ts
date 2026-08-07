// server/lib/vehicle-profile-mapping.ts — Profil véhicule : base / requête
// validée → VehicleProfile domaine. Aucune règle métier : uniquement la
// projection de la ligne (vehicle_profile singleton, 006) et du profil validé
// (Zod, spec §5.4 VEH-1/VEH-2) vers le type du module pur de recommandation.
import type { FuelType } from '../../domain/fuel-prices/types'
import type { VehicleProfile } from '../../domain/vehicle/types'
import type { Db } from '../db/client'
import { createVehicleProfileRepository } from '../repositories/vehicleProfile'
import type { ValidVehicleProfile } from './validation'

// ——— Profil véhicule par défaut (base) → VehicleProfile domaine ———
export async function loadDefaultVehicleProfile(db: Db): Promise<VehicleProfile> {
  const repo = createVehicleProfileRepository(db)
  const row = await repo.get()
  return {
    fuel: row.fuel as FuelType,
    consumption: row.consumption,
    tankCapacity: row.tankCapacity,
    currentLevel: row.currentLevel,
    preferredQuantity: row.preferredQuantity,
    savingsThreshold: row.savingsThreshold
  }
}

export function toDomainVehicle(profile: ValidVehicleProfile): VehicleProfile {
  return {
    fuel: profile.fuel,
    consumption: profile.consumption,
    tankCapacity: profile.tankCapacity,
    currentLevel: profile.currentLevel,
    preferredQuantity: profile.preferredQuantity,
    savingsThreshold: profile.savingsThreshold
  }
}
