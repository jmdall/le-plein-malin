// server/lib/station-mapping.ts — Normalisation serveur des stations.
// Aucune règle métier : uniquement des transformations de forme (StationPrice,
// types providers/base). Le géocodage (resolveCenter) ne dépend que de la
// query validée (spec §4) ; pickReferenceStation implémente le départage
// déterministe (§13 #13, ADR-0002/D2).
import { inArray } from 'drizzle-orm'
import type { FuelType, StationPrice } from '../../domain/fuel-prices/types'
import type { Db } from '../db/client'
import { stations } from '../db/schema'
import type { StationsQuery, ResolvedCenter } from './validation'

// ——— Résolution du centre de recherche ———
// À partir de la query validée (lat/lon ou ville/CP/q). Le géocodage passe
// par createGeocodeProvider. L'hypothèse « centroïde de la ville » est
// explicite dans le label renvoyé (spec §4).
export interface ResolveCenterInput {
  query: Pick<StationsQuery, 'lat' | 'lon' | 'q' | 'city' | 'postalCode'> & {
    positionSource?: 'device' | 'place'
  }
  geocode: (input: string) => Promise<{ label: string; lat: number; lon: number }>
}

export async function resolveCenter(input: ResolveCenterInput): Promise<ResolvedCenter> {
  const { query, geocode } = input
  if (query.lat !== undefined && query.lon !== undefined) {
    // Ticket 031 : des coordonnées ne valent pas toutes une géolocalisation.
    // Un lieu choisi dans l'autocomplete donne un centre exact sans dire où se
    // trouve l'utilisateur — la recommandation doit garder son hypothèse de
    // détour (§13 #16). Le mode distingue les deux ; le défaut reste `device`,
    // donc la géolocalisation garde son comportement.
    const mode = query.positionSource === 'place' ? 'place' : 'geo'
    return { mode, lat: query.lat, lon: query.lon }
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
