import type { FuelType } from '../fuel-prices/types'

export interface VehicleProfile {
  fuel: FuelType
  consumption: number // L/100 km, > 0
  tankCapacity: number // L, > 0
  currentLevel: number // L, 0 ≤ x ≤ capacité
  preferredQuantity: number | null // L, non renseignée par défaut
  savingsThreshold: number // €, défaut 1
}
