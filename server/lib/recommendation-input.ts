// server/lib/recommendation-input.ts — Construction de FuelRecommendationInput
// (injection, spec §10.2/10.4). Les détours sont calculés ICI (km) via le
// module pur domain/fuel-prices/detour (D2, ADR-0002) ; le module de
// recommandation ne voit que des km. Aucune règle métier en plus : uniquement
// l'assemblage de l'input à partir des stations fournies.
import { haversineKm } from '../../domain/fuel-prices/haversine'
import { computeDetourKm } from '../../domain/fuel-prices/detour'
import type { FuelType, StationPrice } from '../../domain/fuel-prices/types'
import type { VehicleProfile } from '../../domain/vehicle/types'
import type {
  CandidateWithDistance,
  FuelRecommendationInput,
  TrendSignal
} from '../../domain/stations/types'
import type { ResolvedCenter } from './validation'
import {
  pickReferenceStation,
  toStationPriceWithDistance,
  type StationWithDistance
} from './station-mapping'

export function buildRecommendationInput(options: {
  fuelType: FuelType
  vehicle: VehicleProfile
  center: ResolvedCenter
  stations: StationPrice[]
  threshold?: number
  quantityToBuy?: number
  now: Date
  trend?: TrendSignal
}): FuelRecommendationInput {
  const { fuelType, vehicle, center, stations, now } = options
  const threshold = options.threshold ?? vehicle.savingsThreshold

  // Distances au centre (haversine côté serveur, D3).
  const withDistance = stations.map((s) => ({
    ...s,
    distanceKm: haversineKm({ lat: center.lat, lon: center.lon }, s.position)
  }))

  const ref = pickReferenceStation(withDistance)
  if (!ref) {
    // Aucune station : le module produira insufficient-data. On passe une
    // référence « factice » non nulle car le module n'est pas appelé avec une
    // référence vide (il lit referenceStation.price). Le résultat reste
    // insufficient-data (candidates vide), aucun prix n'est inventé.
    const empty: StationPrice = {
      id: 'none',
      name: 'Aucune station',
      brand: null,
      address: '',
      city: '',
      postalCode: '',
      position: { lat: center.lat, lon: center.lon },
      fuel: fuelType,
      price: 0,
      updatedAt: now
    }
    return {
      fuelType,
      quantityToBuy: options.quantityToBuy ?? 0,
      vehicle,
      referenceStation: empty,
      candidates: [],
      threshold,
      now,
      trend: options.trend,
      hasGeoLocation: center.mode === 'geo'
    }
  }

  const reference = toStationPriceWithDistance(
    withDistance.find((s) => s.id === ref.id) as StationWithDistance
  )

  // Détour de chaque candidate (D2 / ADR-0002) :
  //   - géolocalisé : distance réelle user→station (détour A/R relatif à la
  //     station de référence la plus proche : max(0, dist_c − dist_r) × 2) ;
  //   - ville/CP : idem (hypothèse affichée, spec §4).
  const candidates: CandidateWithDistance[] = withDistance
    .filter((s) => s.id !== reference.id)
    .map((s) => ({
      station: toStationPriceWithDistance(s),
      detourDistanceKm: computeDetourKm(s.distanceKm, ref.distanceKm)
    }))

  return {
    fuelType,
    quantityToBuy: options.quantityToBuy ?? Math.max(0, vehicle.tankCapacity - vehicle.currentLevel),
    vehicle,
    referenceStation: reference,
    candidates,
    threshold,
    now,
    trend: options.trend,
    hasGeoLocation: center.mode === 'geo'
  }
}
