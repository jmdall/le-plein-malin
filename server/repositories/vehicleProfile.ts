// server/repositories/vehicleProfile.ts — Singleton vehicle_profile (spec §9.4, VEH-4).
// Seed d'une ligne par défaut (seuil 1 €) quand aucune n'existe. Sans règle métier.
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { vehicleProfile } from '../db/schema'

export interface VehicleProfileRow {
  id: number
  fuel: string
  consumption: number
  tankCapacity: number
  currentLevel: number
  preferredQuantity: number | null
  savingsThreshold: number
  updatedAt: Date
}

export function createVehicleProfileRepository(db: Db) {
  return {
    // Retourne la ligne du singleton ; en crée une par défaut si absente (VEH-4).
    async get(): Promise<VehicleProfileRow> {
      const existing = await db.select().from(vehicleProfile).get()
      if (existing) {
        return existing
      }
      const now = new Date()
      const defaults = {
        fuel: 'Gazole',
        consumption: 6,
        tankCapacity: 60,
        currentLevel: 30,
        preferredQuantity: null,
        savingsThreshold: 1,
        updatedAt: now
      }
      const inserted = await db
        .insert(vehicleProfile)
        .values(defaults)
        .returning()
        .get()
      return inserted
    },

    async put(row: Omit<VehicleProfileRow, 'id' | 'updatedAt'>): Promise<VehicleProfileRow> {
      const current = await this.get()
      const updated = await db
        .update(vehicleProfile)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(vehicleProfile.id, current.id))
        .returning()
        .get()
      return updated
    }
  }
}
