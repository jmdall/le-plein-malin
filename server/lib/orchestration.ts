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
import { inArray } from 'drizzle-orm'
import { computeDetourKm } from '../../domain/fuel-prices/detour'
import { haversineKm } from '../../domain/fuel-prices/haversine'
import { computeFreshness } from '../../domain/fuel-prices/freshness'
import { computeCandidateEconomics } from '../../domain/fuel-prices/economics'
import { computePriceAttractiveness } from '../../domain/fuel-prices/priceAttractiveness'
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
import { OSM_METADATA_SOURCE_NAME } from '../providers/types'
import type { FuelPriceProvider, ProviderResult } from '../providers/types'
import type { Db } from '../db/client'
import { stations } from '../db/schema'
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
  brandWikidataId: string | null
  logoUrl: string | null
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
    brandWikidataId: row.brandWikidataId,
    logoUrl: row.logoUrl,
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
    brandWikidataId: s.brandWikidataId,
    logoUrl: s.logoUrl,
    address: s.address,
    city: s.city,
    postalCode: s.postalCode,
    position: { lat: s.position.lat, lon: s.position.lon },
    fuel: s.fuel,
    price: s.price,
    updatedAt: s.updatedAt
  }
}

// ——— Enrichissement d'identité côté API (ticket 019/020) ———
// Le provider de prix (Opendatasoft / export / roulez-eco) renvoie des
// stations avec name = id et brand = null : le flux officiel ne publie pas
// les noms réels. L'identité réelle (nom, enseigne, logo) vit en base, posée
// par le job de sync (019). On la RÉINJECTE ici pour chaque station de la
// réponse : le client n'a jamais d'id à afficher, quelle que soit la source
// du provider (REC-2/D1). Best-effort : une station absente de la base garde
// l'identité du provider (jamais un nom fabriqué) ; un nom réel en base
// n'est jamais écrasé par un id.
export async function enrichStationsWithDbIdentity(
  db: Db,
  stationsIn: StationPrice[]
): Promise<StationPrice[]> {
  if (stationsIn.length === 0) return stationsIn
  const ids = [...new Set(stationsIn.map((s) => s.id))]
  const rows = await db
    .select({
      id: stations.id,
      name: stations.name,
      brand: stations.brand,
      brandWikidataId: stations.brandWikidataId,
      logoUrl: stations.logoUrl,
      address: stations.address,
      city: stations.city,
      postalCode: stations.postalCode
    })
    .from(stations)
    .where(inArray(stations.id, ids))
    .all()
  const byId = new Map(rows.map((r) => [r.id, r]))

  return stationsIn.map((s) => {
    const row = byId.get(s.id)
    if (!row) return s
    // L'identité de la base prime quand elle est réelle (nom ≠ id ou une
    // enseigne) ; sinon on garde celle du provider (id par défaut).
    const dbNameIsReal = row.name !== row.id || row.brand !== null
    if (!dbNameIsReal) return s
    return {
      ...s,
      name: row.name,
      brand: row.brand,
      brandWikidataId: row.brandWikidataId,
      logoUrl: row.logoUrl,
      // L'adresse réelle de la base (issue de l'export officiel) complète
      // celle du provider quand celui-ci n'en fournit pas.
      address: s.address !== '' ? s.address : row.address,
      city: s.city !== '' ? s.city : row.city,
      postalCode: s.postalCode !== '' ? s.postalCode : row.postalCode
    }
  })
}

// ——— Réponse /api/stations (orchestration) ———
// Réutilise le provider (repli automatique) puis calcule distances/référence.
export async function buildStationsResponse(options: {
  provider: FuelPriceProvider
  query: StationsQuery
  center: ResolvedCenter
  db?: Db
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
    const withDistance = stations.map((s) => ({
      ...s,
      distanceKm: haversineKm({ lat: center.lat, lon: center.lon }, s.position)
    }))

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
      detourDistanceKm: computeDetourKm(s.distanceKm, ref.distanceKm)
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

  // Identité réelle depuis la base (019/020) : la recommandation expose les
  // noms/enseignes réels, jamais l'id (REC-2/D1). Le calcul (prix/distance)
  // n'est pas affecté.
  const enriched = await enrichStationsWithDbIdentity(db, result.stations)

  // 2. Tendance via l'historique local (005) — sur la station de référence.
  const historyRepo = createPriceHistoryRepository(db)

  // La tendance porte sur la station la plus proche du centre (référence).
  // On cherche d'abord la référence dans les stations du provider.
  const withDistance = enriched.map((s) => ({
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
    stations: enriched,
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
