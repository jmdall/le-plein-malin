import type { FreshnessInfo, StationPrice } from '../fuel-prices/types'
import type { FuelRecommendationInput } from '../stations/types'

export type RecommendationType =
  | 'fill-now' // « Fais le plein maintenant »
  | 'partial-fill' // « Mets seulement X litres »
  | 'wait' // « Tu peux attendre »
  | 'go-to-station' // « Va plutôt à cette station »
  | 'insufficient-data' // « Données insuffisantes »

export interface FuelRecommendation {
  type: RecommendationType
  confidence: number // 0..1
  quantityToBuy: number | null // litres, uniquement pour partial-fill
  recommendedStation: StationPrice | null
  referenceStation: StationPrice | null
  detourCost: number | null
  grossSavings: number | null
  netSavings: number | null
  reasons: string[] // raisons principales
  usedData: string[] // données utilisées
  ignoredData: string[] // données ignorées
  calculations: string[] // calculs effectués
  assumptions: string[] // hypothèses (détour ligne droite, prix candidat…)
  freshness: FreshnessInfo // âge + score
  isPartial: boolean // recommandation partielle (confiance réduite)
}

export declare function calculateFuelRecommendation(
  input: FuelRecommendationInput
): FuelRecommendation
