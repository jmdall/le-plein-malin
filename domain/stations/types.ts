import type { FuelType, StationPrice } from '../fuel-prices/types'
import type { VehicleProfile } from '../vehicle/types'

export interface CandidateWithDistance {
  station: StationPrice
  detourDistanceKm: number // distance supplémentaire A/R déjà calculée (D2/D3)
}

export interface TrendSignal {
  direction: 'down' | 'stable' | 'up' | 'insufficient'
  magnitude: number
}

export interface FuelRecommendationInput {
  fuelType: FuelType
  quantityToBuy: number // litres
  vehicle: VehicleProfile
  referenceStation: StationPrice
  candidates: CandidateWithDistance[]
  threshold: number // €, défaut 1
  now: Date // heure courante injectée (pureté : pas de Date.now() dans le module)
  trend?: TrendSignal // signal de tendance (ticket 005) ; absent → stable
  hasGeoLocation?: boolean // défaut true ; false = détour approximatif (D2, §13 #16)
  // Comment les distances injectées ont été MESURÉES (ticket 033, ADR-0005).
  // Défaut `straight-line` : le module n'annonce jamais un routage routier qui
  // n'a pas eu lieu. Indépendant de hasGeoLocation — bien router ne dit pas où
  // se trouve l'utilisateur.
  detourSource?: 'road' | 'straight-line'
}
