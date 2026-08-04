// utils/stations.ts — Types et présentation de la liste des stations (ticket
// 011, spec §5.3 STA-1/2/3). L'UI ne recalcule RIEN : le serveur fournit
// distance, fraîcheur et grandeurs d'économie (REC-2/D1). Ce module ne fait
// que le tri par défaut (économie nette décroissante, favoris en tête,
// référence et non rentables en bas — STA-2/STA-4) et les libellés de
// fraîcheur accessibles (STA-3, FRE-1, NFR-ACC-4).
import type { RecommendationRequest } from './recommendation'

export interface ListedStation {
  id: string
  name: string
  brand: string | null
  // Enrichissement d'identité (016-019, ticket 020) : optionnels en miroir du
  // domaine StationPrice — le serveur les envoie null quand la source ne les
  // fournit pas. L'UI affiche le logo/enseigne seulement s'ils sont présents.
  brandWikidataId?: string | null
  logoUrl?: string | null
  address: string
  city: string
  postalCode: string
  position: { lat: number; lon: number }
  fuel: string
  price: number
  updatedAt: string
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
}

export interface StationsQueryResult {
  stations: ListedStation[]
  referenceStation: ListedStation | null
  query: {
    center: { lat: number; lon: number }
    radius: number
    fuel: string
  }
  // Attribution OSM (ODbL) fournie par l'API (ticket 020) : l'UI l'affiche
  // sans la recoder (REC-2/D1).
  attribution?: { source: string }
}

export type StationsRequest = Omit<RecommendationRequest, 'vehicleProfile'>

// ——— Libellés de fraîcheur (STA-3). Texte toujours présent : la couleur
// n'est jamais le seul vecteur d'information (NFR-ACC-4). ———
export const FRESHNESS_LABELS: Record<ListedStation['freshness']['status'], string> = {
  fresh: 'frais',
  stale: 'potentiellement obsolète',
  obsolete: 'exclu des recommandations'
}

export const FRESHNESS_ATTRIBUTES: Record<ListedStation['freshness']['status'], string> = {
  fresh: 'frais',
  stale: 'stale',
  obsolete: 'obsolete'
}

// ——— Tri par défaut de la liste (STA-2) ———
// 1. favoris en tête (STA-4) ; 2. station de référence en bas (elle est le
// point de comparaison, pas une alternative) ; 3. non rentables en bas ;
// 4. économie nette décroissante (départage stable : prix, puis distance,
// puis id — §13 #13).
export function sortStations(stations: ListedStation[], favorites: string[]): ListedStation[] {
  const favoriteSet = new Set(favorites)
  return [...stations].sort((a, b) => {
    const aFav = favoriteSet.has(a.id) ? 0 : 1
    const bFav = favoriteSet.has(b.id) ? 0 : 1
    if (aFav !== bFav) return aFav - bFav

    if (a.isReference !== b.isReference) return a.isReference ? 1 : -1

    const aNet = a.economics.netSavings
    const bNet = b.economics.netSavings
    const aRentable = aNet !== null && aNet >= 0
    const bRentable = bNet !== null && bNet >= 0
    if (aRentable !== bRentable) return aRentable ? -1 : 1

    if (aNet !== null && bNet !== null && aNet !== bNet) return bNet - aNet

    if (a.price !== b.price) return a.price - b.price
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
    return a.id.localeCompare(b.id)
  })
}
