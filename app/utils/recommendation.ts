// utils/recommendation.ts — Types client + présentation de la recommandation
// (ticket 010, spec §5.6 REC-1/REC-2/REC-4). L'UI ne recalcule RIEN : elle
// affiche les champs fournis par le module via l'API (REC-2/D1). Les libellés
// « tendance probable », « selon les données récentes »… respectent REC-4
// (jamais une certitude).
import type { FuelValue } from './fuel'

export interface RecommendationStation {
  id: string
  name: string
  brand: string | null
  /** Enrichissement d'identité (020) : URL de logo validée côté serveur,
      null quand absente — l'UI ne fait que l'afficher (REC-2/D1). */
  logoUrl?: string | null
  address: string
  city: string
  postalCode: string
  position: { lat: number; lon: number }
  fuel: string
  price: number
  updatedAt: string
}

export type RecommendationType =
  | 'fill-now'
  | 'partial-fill'
  | 'wait'
  | 'go-to-station'
  | 'insufficient-data'

export interface FreshnessInfo {
  ageInHours: number
  status: 'fresh' | 'stale' | 'obsolete'
  score: number
}

export interface Recommendation {
  type: RecommendationType
  confidence: number
  quantityToBuy: number | null
  recommendedStation: RecommendationStation | null
  referenceStation: RecommendationStation | null
  detourCost: number | null
  grossSavings: number | null
  netSavings: number | null
  reasons: string[]
  usedData: string[]
  ignoredData: string[]
  calculations: string[]
  assumptions: string[]
  freshness: FreshnessInfo
  isPartial: boolean
}

export interface RecommendationApiResponse {
  recommendation: Recommendation
}

export interface VehicleProfilePayload {
  consumption: number
  tankCapacity: number
  currentLevel: number
  fuel: FuelValue
  preferredQuantity: number | null
  savingsThreshold: number
}

export type LocationMode = 'geo' | 'query'

export interface RecommendationRequest {
  lat?: number
  lon?: number
  // Provenance de lat/lon (ticket 031). `device` = position de l'appareil ;
  // `place` = centroïde d'un lieu choisi dans l'autocomplete. Le serveur en a
  // besoin pour savoir s'il peut retirer l'hypothèse de détour (§13 #16).
  // Absent ⇒ `device` côté serveur : les appels existants ne changent pas.
  positionSource?: 'device' | 'place'
  q?: string
  city?: string
  postalCode?: string
  radius: number
  fuel: FuelValue
  vehicleProfile?: VehicleProfilePayload
}

export const RECOMMENDATION_TITLES: Record<RecommendationType, string> = {
  'fill-now': 'Fais le plein maintenant',
  'partial-fill': 'Mets seulement quelques litres',
  wait: 'Tu peux attendre',
  'go-to-station': 'Va plutôt à cette station',
  'insufficient-data': 'Données insuffisantes'
}

// ——— Libellé confidentiel accessible (NFR-ACC-4 : la couleur seule ne suffit
// pas ; le niveau est aussi exprimé en mots). ———
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'élevé'
  if (confidence >= 0.5) return 'moyen'
  return 'faible'
}

// ——— Suggestions pour « Données insuffisantes » (spec §4, parcours d'erreur,
// #18 : élargir le rayon, changer de carburant). ———
export const INSUFFICIENT_SUGGESTIONS: Array<{ label: string; value: number }> = [
  { label: 'élargir le rayon à 20 km', value: 20 },
  { label: 'élargir le rayon à 30 km', value: 30 }
]
