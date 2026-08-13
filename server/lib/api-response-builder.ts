// server/lib/api-response-builder.ts — Builders des réponses de l'API REST
// (spec §8). Réunissent l'infrastructure (provider, base, repositories) et le
// domaine pur (haversine, freshness, economics, priceAttractiveness,
// calculateFuelRecommendation, calculateTrendIndicators). Aucune règle métier
// propre ici : l'assemblage des réponses, la référence est la plus proche du
// centre (ADR-0002/D2), le détour est calculé par le module pur
// domain/fuel-prices/detour (D2, ADR-0002).
import { computeDetourKm } from '../../domain/fuel-prices/detour'
import { computeFreshness } from '../../domain/fuel-prices/freshness'
import { computeCandidateEconomics } from '../../domain/fuel-prices/economics'
import { computePriceAttractiveness } from '../../domain/fuel-prices/priceAttractiveness'
import { calculateFuelRecommendation } from '../../domain/recommendation/calculate'
import { calculateTrendIndicators } from '../../domain/trend/calculateTrend'
import type { FuelRecommendation } from '../../domain/recommendation/types'
import type { TrendIndicators } from '../../domain/trend/types'
import type { StationPrice, FuelType } from '../../domain/fuel-prices/types'
import type { VehicleProfile } from '../../domain/vehicle/types'
import type { TrendSignal } from '../../domain/stations/types'
import { OSM_METADATA_SOURCE_NAME } from '../providers/types'
import type { FuelPriceProvider, ProviderResult } from '../providers/types'
import type { Db } from '../db/client'
import { createStationsRepository } from '../repositories/stations'
import { createPricesRepository } from '../repositories/prices'
import { createPriceHistoryRepository } from '../repositories/priceHistory'
import type { StationsQuery, ResolvedCenter } from './validation'
import { createApiError } from './api-errors'
import {
  enrichStationsWithDbIdentity,
  pickReferenceStation,
  toStationPriceWithDistance,
  type StationWithDistance
} from './station-mapping'
import { buildRecommendationInput } from './recommendation-input'
import { resolveStationDistances } from './station-distances'
import type { RouteDistanceProvider } from '../providers/routeDistance'

// ——— Réponse /api/stations ———
export interface StationsResponse {
  stations: StationPrice[]
  referenceStation: StationPrice | null
  query: {
    center: { lat: number; lon: number }
    radius: number
    fuel: FuelType
  }
  // Attribution OSM (ODbL, ticket 018/020) : la mention que l'UI affiche pour
  // créditer la source des métadonnées d'identité (noms réels / enseigne /
  // logo). Constante de 019, jamais recodée côté client (REC-2/D1). Toujours
  // présente : les métadonnées viennent toujours d'OSM.
  attribution: { source: string }
}

// ——— Station enrichie pour la liste (ticket 011, spec §5.3 STA-1) ———
// Le serveur calcule la distance haversine (D3/LOC-5), les grandeurs
// d'économie (formules CONTEXT.md, source unique domain/fuel-prices/economics)
// et la fraîcheur (domain/fuel-prices/freshness). Le client ne recalcule RIEN.
export interface ListedStation extends StationPrice {
  distanceKm: number
  isReference: boolean
  economics: {
    detourCost: number | null
    grossSavings: number | null
    netSavings: number | null
  }
  freshness: {
    ageInHours: number
    status: 'fresh' | 'stale' | 'obsolete'
    score: number
  }
  // Attractivité du prix (dégradé des marqueurs de la carte) : 0 = le plus
  // cher de la bande (±15 % de la référence), 1 = le moins cher, 0,5 = prix
  // égal à la référence (module pur domain/fuel-prices/priceAttractiveness).
  // null pour la station de référence (point de comparaison, pas une
  // alternative).
  attractiveness: number | null
  // Enrichissement d'identité (016-019) : l'enseigne réelle, son identifiant
  // Wikidata et l'URL du logo, exposés par l'API quand disponibles (ticket
  // 020). Nullables — jamais inventés (REC-2/D1) ; le nom réel est `name`.
  brand: string | null
  brandWikidataId: string | null
  logoUrl: string | null
}

export interface StationsListResponse {
  stations: ListedStation[]
  referenceStation: StationPrice | null
  query: {
    center: { lat: number; lon: number }
    radius: number
    fuel: FuelType
  }
  // Attribution OSM (ODbL) pour les métadonnées d'identité des stations —
  // affichée par l'UI (ticket 021), constante 019.
  attribution: { source: string }
}

// ——— Réponse /api/recommendation ———
export interface RecommendationResponse {
  recommendation: FuelRecommendation
}

// ——— Réponse /api/stations (orchestration) ———
// Réutilise le provider (repli automatique) puis calcule distances/référence.
export async function buildStationsResponse(options: {
  provider: FuelPriceProvider
  query: StationsQuery
  center: ResolvedCenter
  db?: Db
  route?: RouteDistanceProvider
}): Promise<StationsResponse> {
  const { provider, query } = options
  const center = options.center

  const result: ProviderResult = await provider.findNearbyStations({
    center: { lat: center.lat, lon: center.lon },
    radiusKm: query.radius,
    fuel: query.fuel
  })

  // Identité réelle depuis la base (019/020) : le client n'affiche jamais l'id.
  const stations: StationPrice[] = options.db
    ? await enrichStationsWithDbIdentity(options.db, result.stations)
    : result.stations
  const { withDistance } = await resolveStationDistances({
    center: { lat: center.lat, lon: center.lon },
    stations,
    route: options.route
  })

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
    },
    attribution: { source: OSM_METADATA_SOURCE_NAME }
  }
}

// ——— Réponse /api/stations enrichie (ticket 011) ———
// Même orchestration que buildStationsResponse + distance, fraîcheur et
// grandeurs d'économie (STA-1) pour chaque station de la liste. En mode
// ville/CP, le détour A/R est l'hypothèse D2 (max(0, dist_c − dist_r) × 2) ;
// en mode géolocalisé, il l'est aussi (spec §4, ADR-0002). La référence est
// marquée isReference et n'a jamais d'économie (elle est le point de
// comparaison). Le quantity par défaut vient du profil véhicule si fourni.
export async function buildStationsList(options: {
  provider: FuelPriceProvider
  query: StationsQuery
  center: ResolvedCenter
  db?: Db
  route?: RouteDistanceProvider
  vehicle?: { consumption: number; currentLevel: number; tankCapacity: number }
  now?: () => Date
}): Promise<StationsListResponse> {
  const { provider, query, center } = options
  const now = options.now?.() ?? new Date()
  const vehicle = options.vehicle
  const quantity =
    vehicle && Number.isFinite(vehicle.tankCapacity) && Number.isFinite(vehicle.currentLevel)
      ? Math.max(0, vehicle.tankCapacity - vehicle.currentLevel)
      : 0

  const result: ProviderResult = await provider.findNearbyStations({
    center: { lat: center.lat, lon: center.lon },
    radiusKm: query.radius,
    fuel: query.fuel
  })

  // Identité réelle depuis la base (019/020) : le client n'affiche jamais l'id.
  const stations: StationPrice[] = options.db
    ? await enrichStationsWithDbIdentity(options.db, result.stations)
    : result.stations
  const { withDistance } = await resolveStationDistances({
    center: { lat: center.lat, lon: center.lon },
    stations,
    route: options.route
  })

  const reference = pickReferenceStation(withDistance)
  const refDistance = reference?.distanceKm ?? null
  const referenceStation: StationPrice | null = reference
    ? toStationPriceWithDistance(
        withDistance.find((s) => s.id === reference.id) as StationWithDistance
      )
    : null
  const referencePrice = referenceStation?.price ?? null

  const listed: ListedStation[] = withDistance.map((s) => {
    const isReference = reference !== undefined && s.id === reference.id
    const detourDistanceKm = computeDetourKm(s.distanceKm, refDistance ?? 0)
    const economics =
      referencePrice !== null && vehicle && reference !== undefined && reference.id !== s.id
        ? computeCandidateEconomics({
            referencePrice,
            candidatePrice: s.price,
            detourDistanceKm,
            consumption: vehicle.consumption,
            quantity
          })
        : { detourCost: null, grossSavings: null, netSavings: null }
    const freshness = computeFreshness(s.updatedAt, now)
    // Attractivité du prix vs référence (module pur, bande ±15 %). La
    // référence elle-même en a une aussi : son prix égale la base, donc
    // elle tombe au MILIEU du dégradé (0,5) — elle reste visuellement
    // neutre mais n'est plus « sans couleur ». Tous les badges portent le
    // dégradé (demande produit).
    const attractiveness =
      referencePrice !== null
        ? computePriceAttractiveness({ referencePrice, price: s.price })
        : null
    return {
      ...toStationPriceWithDistance(s),
      // Enrichissement d'identité : toujours présents (null si absents —
      // jamais inventés, REC-2/D1). Le nom réel est déjà `name` (019).
      brand: s.brand ?? null,
      brandWikidataId: s.brandWikidataId ?? null,
      logoUrl: s.logoUrl ?? null,
      distanceKm: s.distanceKm,
      isReference,
      economics,
      attractiveness,
      freshness: {
        ageInHours: freshness.ageInHours,
        status: freshness.status,
        score: freshness.score
      }
    }
  })

  return {
    stations: listed,
    referenceStation,
    query: {
      center: { lat: center.lat, lon: center.lon },
      radius: query.radius,
      fuel: query.fuel
    },
    attribution: { source: OSM_METADATA_SOURCE_NAME }
  }
}

// ——— Réponse /api/recommendation (orchestration) ———
export async function buildRecommendationResponse(options: {
  db: Db
  provider: FuelPriceProvider
  query: StationsQuery
  center: ResolvedCenter
  vehicle: VehicleProfile
  route?: RouteDistanceProvider
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

  // Identité réelle depuis la base (019/020) : la recommandation expose les
  // noms/enseignes réels, jamais l'id (REC-2/D1). Le calcul (prix/distance)
  // n'est pas affecté.
  const enriched = await enrichStationsWithDbIdentity(db, result.stations)

  // 2. Tendance via l'historique local (005) — sur la station de référence.
  const historyRepo = createPriceHistoryRepository(db)

  // La tendance porte sur la station la plus proche du centre (référence).
  // On cherche d'abord la référence dans les stations du provider.
  const { withDistance, source: detourSource } = await resolveStationDistances({
    center: { lat: center.lat, lon: center.lon },
    stations: enriched,
    route: options.route
  })
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
    stations: enriched,
    withDistance,
    detourSource,
    now,
    trend
  })
  const recommendation = calculateFuelRecommendation(input)

  return { recommendation }
}

// ——— Réponse /api/stations/:id (détail) ———
// Une station sans aucun prix en base n'a PAS de prix fabriqué : les champs
// price/fuel/updatedAt du station sont null (le client affiche « prix
// indisponible »). Invariant CONTEXT.md : aucun prix n'est inventé.
export interface StationDetailResponse {
  station: Omit<StationPrice, 'price' | 'fuel' | 'updatedAt'> & {
    price: number | null
    fuel: FuelType | null
    updatedAt: Date | null
    brand: string | null
    brandWikidataId: string | null
    logoUrl: string | null
  }
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

  const first = fuelPrices[0]
  return {
    station: {
      id: station.id,
      name: station.name,
      brand: station.brand,
      brandWikidataId: station.brandWikidataId,
      logoUrl: station.logoUrl,
      address: station.address,
      city: station.city,
      postalCode: station.postalCode,
      position: { lat: station.latitude, lon: station.longitude },
      // Aucun prix en base → null, jamais 0 ni un carburant par défaut.
      fuel: first?.fuel ?? null,
      price: first?.price ?? null,
      updatedAt: first?.updatedAt ?? null
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
