// server/lib/orchestration.ts — Orchestration de l'API REST (ticket 009, spec §8).
//
// Réunit l'infrastructure (repositories, provider, géocodage) et le domaine
// pur (haversine, calculateFuelRecommendation, calculateTrendIndicators).
// Règles décidées ici, conformes spec/ADR :
//   - distances calculées côté serveur avec la haversine pure du domaine
//     (domain/fuel-prices/haversine, D3 / LOC-5) ;
//   - station de référence = la plus proche du centre du rayon, départage
//     déterministe par distance puis id (§13 #13, ADR-0002) ;
//   - détour = max(0, dist_candidate − dist_référence) × 2 en mode ville/CP
//     (D2, ADR-0002) ; en mode géolocalisé, détour = max(0, dist_c − dist_r) × 2
//     aussi (hypothèse ligne droite A/R, spec §4) ;
//   - l'API n'appelle jamais la logique métier pour « recalculer » : elle
//     injecte des km déjà calculés dans FuelRecommendationInput (spec §10.4).
//
// La position précise de l'utilisateur (lat/lon de la requête) n'est jamais
// persistée ni loggée (LOC-4, NFR-SEC-4) : seul le centroïde géocodé ou le
// centre du rayon transite en mémoire.
import { haversineKm } from '../../domain/fuel-prices/haversine'
import { calculateFuelRecommendation } from '../../domain/recommendation/calculate'
import { calculateTrendIndicators } from '../../domain/trend/calculateTrend'
import type { FuelRecommendation } from '../../domain/recommendation/types'
import type { TrendIndicators } from '../../domain/trend/types'
import type { StationPrice, FuelType } from '../../domain/fuel-prices/types'
import type { VehicleProfile } from '../../domain/vehicle/types'
import type {
  CandidateWithDistance,
  FuelRecommendationInput,
  TrendSignal
} from '../../domain/stations/types'
import type { FuelPriceProvider, ProviderResult } from '../providers/types'
import type { Db } from '../db/client'
import { createStationsRepository } from '../repositories/stations'
import { createPricesRepository } from '../repositories/prices'
import { createPriceHistoryRepository } from '../repositories/priceHistory'
import { createVehicleProfileRepository } from '../repositories/vehicleProfile'
import type { StationsQuery, ResolvedCenter, ValidVehicleProfile } from './validation'

// ——— Réponse /api/stations ———
export interface StationsResponse {
  stations: StationPrice[]
  referenceStation: StationPrice | null
  query: {
    center: { lat: number; lon: number }
    radius: number
    fuel: FuelType
  }
}

// ——— Réponse /api/recommendation ———
export interface RecommendationResponse {
  recommendation: FuelRecommendation
}

// ——— Erreur structurée ———
export interface ApiError {
  statusCode: number
  body: { error: { code: string; message: string } }
}

// ——— Résolution du centre de recherche ———
// À partir de la query validée (lat/lon ou ville/CP/q). Le géocodage passe
// par createGeocodeProvider. L'hypothèse « centroïde de la ville » est
// explicite dans le label renvoyé (spec §4).
export interface ResolveCenterInput {
  query: Pick<StationsQuery, 'lat' | 'lon' | 'q' | 'city' | 'postalCode'>
  geocode: (input: string) => Promise<{ label: string; lat: number; lon: number }>
}

export async function resolveCenter(input: ResolveCenterInput): Promise<ResolvedCenter> {
  const { query, geocode } = input
  if (query.lat !== undefined && query.lon !== undefined) {
    return { mode: 'geo', lat: query.lat, lon: query.lon }
  }
  // Mode ville/CP : le centroïde est géocodé (spec §4, §8). q peut être une
  // ville OU un code postal ; city/postalCode sont explicites.
  const raw = query.q ?? query.city ?? query.postalCode
  if (raw === undefined) {
    // Ne peut pas arriver (validé en amont), mais garde le type sûr.
    throw new Error('Résolution du centre : aucun centre de recherche fourni')
  }
  const geo = await geocode(raw)
  return { mode: 'query', label: geo.label, lat: geo.lat, lon: geo.lon }
}

// ——— Sélection de la station de référence ———
// La plus proche du centre du rayon (distance haversine), départage
// déterministe par distance puis id (§13 #13, ADR-0002/D2).
export function pickReferenceStation(
  stations: Array<{ id: string; distanceKm: number }>
): { id: string; distanceKm: number } | undefined {
  if (stations.length === 0) return undefined
  return [...stations].sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
    return a.id.localeCompare(b.id)
  })[0]
}

// ——— Stations → StationPrice[] (normalisation serveur) ———
export interface StationInRadius {
  id: string
  name: string
  brand: string | null
  address: string
  city: string
  postalCode: string
  latitude: number
  longitude: number
  fuel: string
  price: number
  updatedAt: Date
  distanceKm: number
}

export function toStationPrice(row: StationInRadius): StationPrice {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    address: row.address,
    city: row.city,
    postalCode: row.postalCode,
    position: { lat: row.latitude, lon: row.longitude },
    fuel: row.fuel as FuelType,
    price: row.price,
    updatedAt: row.updatedAt
  }
}

// Entrée avec distance (position GeoPoint) → StationPrice, en réutilisant les
// coordonnées déjà calculées (pas de re-normalisation à partir de lat/lon).
export interface StationWithDistance extends StationPrice {
  distanceKm: number
}

export function toStationPriceWithDistance(s: StationWithDistance): StationPrice {
  return {
    id: s.id,
    name: s.name,
    brand: s.brand,
    address: s.address,
    city: s.city,
    postalCode: s.postalCode,
    position: { lat: s.position.lat, lon: s.position.lon },
    fuel: s.fuel,
    price: s.price,
    updatedAt: s.updatedAt
  }
}

// ——— Réponse /api/stations (orchestration) ———
// Réutilise le provider (repli automatique) puis calcule distances/référence.
export async function buildStationsResponse(options: {
  provider: FuelPriceProvider
  query: StationsQuery
  center: ResolvedCenter
}): Promise<StationsResponse> {
  const { provider, query } = options
  const center = options.center

  const result: ProviderResult = await provider.findNearbyStations({
    center: { lat: center.lat, lon: center.lon },
    radiusKm: query.radius,
    fuel: query.fuel
  })

  const stations: StationPrice[] = result.stations
  const withDistance = stations.map((s) => ({
    ...s,
    distanceKm: haversineKm({ lat: center.lat, lon: center.lon }, s.position)
  }))

  const reference = pickReferenceStation(withDistance)
  const referenceStation: StationPrice | null = reference
    ? toStationPriceWithDistance(
        withDistance.find((s) => s.id === reference.id) as StationWithDistance
      )
    : null

  return {
    stations: withDistance.map((s) => toStationPriceWithDistance(s)),
    referenceStation,
    query: {
      center: { lat: center.lat, lon: center.lon },
      radius: query.radius,
      fuel: query.fuel
    }
  }
}

// ——— Construction de FuelRecommendationInput (injection, spec §10.2/10.4) ———
// Les détours sont calculés ICI (km), le module pur ne voit que des km.
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
      freshnessLimits: { staleAfterHours: 24, obsoleteAfterHours: 48 },
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
      detourDistanceKm: Math.max(0, s.distanceKm - ref.distanceKm) * 2
    }))

  return {
    fuelType,
    quantityToBuy: options.quantityToBuy ?? Math.max(0, vehicle.tankCapacity - vehicle.currentLevel),
    vehicle,
    referenceStation: reference,
    candidates,
    threshold,
    freshnessLimits: { staleAfterHours: 24, obsoleteAfterHours: 48 },
    now,
    trend: options.trend,
    hasGeoLocation: center.mode === 'geo'
  }
}

// ——— Réponse /api/recommendation (orchestration) ———
export async function buildRecommendationResponse(options: {
  db: Db
  provider: FuelPriceProvider
  query: StationsQuery
  center: ResolvedCenter
  vehicle: VehicleProfile
  now?: () => Date
}): Promise<RecommendationResponse> {
  const { db, provider, query } = options
  const center = options.center
  const now = options.now?.() ?? new Date()

  // 1. Stations autour du centre (provider + repli automatique).
  const result: ProviderResult = await provider.findNearbyStations({
    center: { lat: center.lat, lon: center.lon },
    radiusKm: query.radius,
    fuel: query.fuel
  })

  // 2. Tendance via l'historique local (005) — sur la station de référence.
  const historyRepo = createPriceHistoryRepository(db)

  // La tendance porte sur la station la plus proche du centre (référence).
  // On cherche d'abord la référence dans les stations du provider.
  const withDistance = result.stations.map((s) => ({
    ...s,
    distanceKm: haversineKm({ lat: center.lat, lon: center.lon }, s.position)
  }))
  const ref = pickReferenceStation(withDistance)

  let trend: TrendSignal | undefined
  if (ref) {
    const snapshots = await historyRepo.findByStationAndFuel(ref.id, query.fuel)
    if (snapshots.length > 0) {
      const indicators = calculateTrendIndicators({
        stationId: ref.id,
        fuel: query.fuel,
        now,
        snapshots: snapshots.map((s) => ({
          day: new Date(s.day + 'T00:00:00Z'),
          price: s.price
        }))
      })
      trend = indicators.trend
    }
  }

  // 3. Injection dans le module pur (spec §10.4) : km déjà calculés.
  const input = buildRecommendationInput({
    fuelType: query.fuel,
    vehicle: options.vehicle,
    center,
    stations: result.stations,
    now,
    trend
  })
  const recommendation = calculateFuelRecommendation(input)

  return { recommendation }
}

// ——— Réponse /api/stations/:id (détail) ———
export interface StationDetailResponse {
  station: StationPrice
  prices: Array<{ fuel: FuelType; price: number; updatedAt: Date; rupture: boolean }>
}

export async function buildStationDetailResponse(options: {
  db: Db
  id: string
}): Promise<StationDetailResponse> {
  const { db, id } = options
  const stationsRepo = createStationsRepository(db)
  const pricesRepo = createPricesRepository(db)

  const station = await stationsRepo.findById(id)
  if (!station) {
    throw createApiError(404, 'STATION_NOT_FOUND', `Station inconnue : ${id}`)
  }

  const rows = await pricesRepo.findByStation(id)
  const fuelPrices = rows.map((r) => ({
    fuel: r.fuel as FuelType,
    price: r.price,
    updatedAt: r.updatedAt,
    rupture: r.rupture
  }))

  return {
    station: {
      id: station.id,
      name: station.name,
      brand: station.brand,
      address: station.address,
      city: station.city,
      postalCode: station.postalCode,
      position: { lat: station.latitude, lon: station.longitude },
      fuel: (fuelPrices[0]?.fuel ?? 'Gazole') as FuelType,
      price: fuelPrices[0]?.price ?? 0,
      updatedAt: fuelPrices[0]?.updatedAt ?? station.syncedAt
    },
    prices: fuelPrices
  }
}

// ——— Réponse /api/stations/:id/history (tendance) ———
export async function buildTrendResponse(options: {
  db: Db
  id: string
  fuel: FuelType
  now?: () => Date
}): Promise<{ indicators: TrendIndicators }> {
  const { db, id, fuel } = options
  const now = options.now?.() ?? new Date()
  const stationsRepo = createStationsRepository(db)
  const historyRepo = createPriceHistoryRepository(db)

  const station = await stationsRepo.findById(id)
  if (!station) {
    throw createApiError(404, 'STATION_NOT_FOUND', `Station inconnue : ${id}`)
  }

  const snapshots = await historyRepo.findByStationAndFuel(id, fuel)
  if (snapshots.length === 0) {
    throw createApiError(
      404,
      'NO_HISTORY',
      `Aucun historique pour la station ${id} (carburant ${fuel})`
    )
  }

  const indicators = calculateTrendIndicators({
    stationId: id,
    fuel,
    now,
    snapshots: snapshots.map((s) => ({
      day: new Date(s.day + 'T00:00:00Z'),
      price: s.price
    }))
  })

  return { indicators }
}

// ——— Erreur structurée { error: { code, message } } ———
export function createApiError(statusCode: number, code: string, message: string): ApiError {
  return { statusCode, body: { error: { code, message } } }
}

export function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    'body' in err &&
    typeof (err as ApiError).statusCode === 'number'
  )
}

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
