// domain/fuel-prices/economics.ts — Formules d'économie par station (ticket 011,
// spec §5.5 / CONTEXT.md). Module pur (aucune dépendance Nuxt/HTTP/SQLite) :
// c'est l'unique source des grandeurs affichées en liste — l'API l'appelle et
// le client ne recalcule rien (STA-1, REC-2/D1).
import type { FreshnessInfo } from './types'
import { computeFreshness } from './freshness'

export interface CandidateEconomicsInput {
  referencePrice: number
  candidatePrice: number
  detourDistanceKm: number
  consumption: number // L/100 km
  quantity: number // litres achetés
}

export interface CandidateEconomics {
  detourCost: number
  grossSavings: number
  netSavings: number
}

// Formules CONTEXT.md §Grandeurs :
//   coût du détour = détour A/R (km) × conso/100 × prix candidat
//   économie brute = (prix réf − prix candidat) × quantité
//   économie nette  = économie brute − coût du détour
export function computeCandidateEconomics(input: CandidateEconomicsInput): CandidateEconomics {
  const detourCost = input.detourDistanceKm * (input.consumption / 100) * input.candidatePrice
  const grossSavings = (input.referencePrice - input.candidatePrice) * input.quantity
  return {
    detourCost,
    grossSavings,
    netSavings: grossSavings - detourCost
  }
}

// Économie brute/nette d'une candidate pour un volume donné + fraîcheur
// (l'API l'utilise pour remplir les champs STA-1 de chaque station).
export interface CandidateEconomicsWithFreshness extends CandidateEconomics {
  freshness: FreshnessInfo
}

export function computeCandidateEconomicsWithFreshness(input: {
  referencePrice: number
  candidatePrice: number
  detourDistanceKm: number
  consumption: number
  quantity: number
  updatedAt: Date
  now: Date
}): CandidateEconomicsWithFreshness {
  const economics = computeCandidateEconomics(input)
  const freshness = computeFreshness(input.updatedAt, input.now)
  return { ...economics, freshness }
}
