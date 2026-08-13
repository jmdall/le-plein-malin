// server/lib/map-stations.ts — Stations d'une emprise pour la carte (ticket
// 037). Répond à « qu'y a-t-il dans cette zone ? », question distincte de
// « où faire le plein ? » (buildStationsList, par rayon).
//
// Cet endpoint ne calcule AUCUNE grandeur d'économie : hors du rayon de
// recherche il n'y a pas de station de référence, donc pas de coût du détour et
// pas d'économie nette. Il dit seulement où sont les stations et à quel prix.
//
// Charge utile volontairement minimale — mesuré sur les 9 483 stations Gazole de
// la base : 833 Ko en forme plate contre 981 Ko avec un objet `freshness`
// imbriqué, pour la même information.
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { computeFreshness } from '../../domain/fuel-prices/freshness'
import type { FuelType } from '../../domain/fuel-prices/types'
import type { Db } from '../db/client'
import { prices, stations } from '../db/schema'
import { MAP_MAX_STATIONS } from './validation'

export interface MapBounds {
  swLat: number
  swLon: number
  neLat: number
  neLon: number
}

// Station telle que la carte en a besoin : de quoi placer un marqueur, le
// colorer et dire si le prix est frais. Rien d'autre — le détail (nom, enseigne,
// logo) est chargé à la demande via /api/stations/:id.
export interface MapStation {
  id: string
  lat: number
  lon: number
  price: number
  ageInHours: number
  status: 'fresh' | 'stale' | 'obsolete'
}

export interface MapStationsResponse {
  stations: MapStation[]
  bounds: MapBounds
  fuel: FuelType
  // Vrai si le plafond a coupé la liste : jamais de troncature silencieuse.
  truncated: boolean
}

// Précision d'affichage : 5 décimales ≈ 1,1 m, très en dessous de la taille d'un
// marqueur. Ce n'est pas une donnée inventée, c'est une donnée arrondie — et
// c'est ce qui permet de diviser la charge utile.
const COORD_DECIMALS = 5

function round(value: number): number {
  return Number(value.toFixed(COORD_DECIMALS))
}

// L'âge sort du domaine en flottant (`294.30294055555555`) : 18 caractères par
// station, soit ~180 Ko sur 9 483 stations pour une précision dont un marqueur
// n'a aucun usage. Arrondi à l'heure — mesuré 1,03 Mo → 856 Ko sur la France
// entière. Le `status` (frais / stale / obsolète) reste calculé sur la valeur
// exacte par le domaine : l'arrondi ne déplace jamais un seuil.
function roundHours(ageInHours: number): number {
  return Math.round(ageInHours)
}

export async function buildMapStationsResponse(options: {
  db: Db
  bounds: MapBounds
  fuel: FuelType
  now?: () => Date
  maxStations?: number
}): Promise<MapStationsResponse> {
  const { db, bounds, fuel } = options
  const now = options.now?.() ?? new Date()
  const max = options.maxStations ?? MAP_MAX_STATIONS

  // Jointure prix : une station sans prix pour CE carburant n'est pas renvoyée
  // (aucun prix inventé). Les stations fermées sont exclues, comme partout.
  // Mesuré : 12,65 ms pour la France entière — aucun index géographique ajouté.
  // On demande une ligne de plus que le plafond pour savoir s'il a coupé.
  const rows = await db
    .select({
      id: stations.id,
      latitude: stations.latitude,
      longitude: stations.longitude,
      price: prices.price,
      updatedAt: prices.updatedAt
    })
    .from(stations)
    .innerJoin(prices, and(eq(prices.stationId, stations.id), eq(prices.fuel, fuel)))
    .where(
      and(
        eq(stations.closed, false),
        gte(stations.latitude, bounds.swLat),
        lte(stations.latitude, bounds.neLat),
        gte(stations.longitude, bounds.swLon),
        lte(stations.longitude, bounds.neLon)
      )
    )
    .orderBy(sql`${stations.id}`)
    .limit(max + 1)
    .all()

  const truncated = rows.length > max
  if (truncated) {
    console.warn(
      `[map-stations] plafond ${max} atteint pour l'emprise ` +
        `${bounds.swLat},${bounds.swLon} → ${bounds.neLat},${bounds.neLon} : liste tronquée.`
    )
  }

  const kept = truncated ? rows.slice(0, max) : rows
  const mapped: MapStation[] = kept.map((row) => {
    // La fraîcheur vient du domaine : l'UI ne recalcule aucune règle 24 h/48 h
    // (REC-2/D1). Les prix périmés restent VISIBLES avec leur statut — ils sont
    // exclus des recommandations, pas de la carte (CONTEXT.md §Fraîcheur).
    const freshness = computeFreshness(row.updatedAt, now)
    return {
      id: row.id,
      lat: round(row.latitude),
      lon: round(row.longitude),
      price: row.price,
      ageInHours: roundHours(freshness.ageInHours),
      status: freshness.status
    }
  })

  return { stations: mapped, bounds, fuel, truncated }
}
