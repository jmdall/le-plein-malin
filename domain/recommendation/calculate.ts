import type { FreshnessInfo } from '../fuel-prices/types'
import { computeFreshness } from '../fuel-prices/freshness'
import { computeCandidateEconomics } from '../fuel-prices/economics'
import type { FuelRecommendation } from './types'
import type { CandidateWithDistance, FuelRecommendationInput } from '../stations/types'

const CRITICAL_LEVEL_RATIO = 0.1 // ≤ 10 % de la capacité
const HIGH_LEVEL_RATIO = 0.8 // ≥ 80 % de la capacité
const MIN_LITER_PRICE = 0.5 // €/L
const MAX_LITER_PRICE = 3.5 // €/L

interface CandidateCost {
  c: CandidateWithDistance
  detourCost: number
  grossSavings: number
  netSavings: number
  freshness: FreshnessInfo
}

function priceInRange(price: number): boolean {
  return Number.isFinite(price) && price >= MIN_LITER_PRICE && price <= MAX_LITER_PRICE
}

function computeCosts(
  input: FuelRecommendationInput,
  quantity: number,
  now: Date
): { costs: CandidateCost[]; ignored: string[] } {
  const ignored: string[] = []
  const costs: CandidateCost[] = []

  for (const c of input.candidates) {
    if (!priceInRange(c.station.price)) {
      ignored.push(`Station ${c.station.id} (prix aberrant, hors intervalle documenté)`)
      continue
    }

    const freshness = computeFreshness(c.station.updatedAt, now)
    if (freshness.status === 'obsolete') {
      ignored.push(`Station ${c.station.id} (prix > 48 h)`)
      continue
    }

    // Formules CONTEXT.md (ticket 011) : source unique partagée avec la liste
    // des stations (domain/fuel-prices/economics) — aucune duplication.
    const { detourCost, grossSavings, netSavings } = computeCandidateEconomics({
      referencePrice: input.referenceStation.price,
      candidatePrice: c.station.price,
      detourDistanceKm: c.detourDistanceKm,
      consumption: input.vehicle.consumption,
      quantity
    })
    costs.push({ c, detourCost, grossSavings, netSavings, freshness })
  }

  return { costs, ignored }
}

export function calculateFuelRecommendation(input: FuelRecommendationInput): FuelRecommendation {
  const reference = input.referenceStation
  const now = input.now
  const freshness = computeFreshness(reference.updatedAt, now)
  const hasStale = freshness.status === 'stale'

  // Données incohérentes : niveau > capacité → neutralisé, recommandation
  // dégradée (isPartial), jamais d'exception (§13 #14).
  let isPartial = hasStale
  const consumption = input.vehicle.consumption
  const incoherentLevel = input.vehicle.currentLevel > input.vehicle.tankCapacity
  if (incoherentLevel) isPartial = true
  const level = Math.min(input.vehicle.currentLevel, input.vehicle.tankCapacity)
  const available = Math.max(0, input.vehicle.tankCapacity - level)
  const quantity = Math.min(input.quantityToBuy, available)

  // Consommation invalide : le module ne calcule pas de coût de détour invalide ;
  // le profil est rejeté (§13 #12).
  if (!Number.isFinite(consumption) || consumption <= 0) {
    return {
      type: 'insufficient-data',
      confidence: 0,
      quantityToBuy: null,
      recommendedStation: null,
      referenceStation: reference,
      detourCost: null,
      grossSavings: null,
      netSavings: null,
      reasons: ['Consommation du véhicule invalide.'],
      usedData: [],
      ignoredData: ['Profil véhicule (consommation invalide)'],
      calculations: [],
      assumptions: ['Vérifier le profil véhicule (consommation).'],
      freshness,
      isPartial: true
    }
  }

  // Tendance insuffisante (pas d'historique, TRE-4 / D4) : décision sur les prix
  // courants, recommandation partielle.
  const trendInsufficient = input.trend?.direction === 'insufficient'
  if (trendInsufficient) isPartial = true

  // Sans géolocalisation : le détour est une hypothèse (D2 / ADR-0002), le
  // module perd en précision → isPartial (§13 #16).
  const withoutGeo = input.hasGeoLocation === false
  if (withoutGeo) isPartial = true

  const { costs, ignored } = computeCosts(input, quantity, now)

  // Règle de fraîcheur §6 : une candidate stale est exclue si une candidate
  // fraîche (rentable) existe ; sinon elle reste éligible par défaut.
  const hasFreshProfitable = costs.some(
    (x) => x.freshness.status === 'fresh' && x.netSavings >= input.threshold
  )
  const eligible = costs.filter((x) => x.freshness.status !== 'stale' || !hasFreshProfitable)

  const profitable = eligible
    .filter((x) => x.netSavings >= input.threshold)
    .sort((a, b) => {
      if (b.netSavings !== a.netSavings) return b.netSavings - a.netSavings
      return a.c.station.id.localeCompare(b.c.station.id)
    })

  const reasonsBase = trendInsufficient
    ? ['Historique insuffisant : tendance probable non calculable, décision sur les prix courants.']
    : ['Tendance probable stable : selon les données récentes.']

  const assumptions = withoutGeo
    ? ['Détour estimé en ligne droite, aller-retour, relatif à la station la plus proche (absence de géolocalisation).']
    : []

  // Le meilleur candidat analysé (toutes les candidates éligibles), pour
  // l'explicabilité des recommandations wait/partial-fill.
  const bestCandidate = eligible.length > 0
    ? [...eligible].sort((a, b) => b.netSavings - a.netSavings || a.c.station.id.localeCompare(b.c.station.id))[0]
    : undefined

  if (profitable.length > 0) {
    const best = profitable[0] as CandidateCost
    return {
      type: 'go-to-station',
      confidence: hasStale ? 0.7 : 1,
      quantityToBuy: quantity,
      recommendedStation: best.c.station,
      referenceStation: reference,
      detourCost: best.detourCost,
      grossSavings: best.grossSavings,
      netSavings: best.netSavings,
      reasons: ['Cette station est moins chère et le détour est rentable.', ...reasonsBase],
      usedData: ['Prix officiels les plus récents pour ce carburant.'],
      ignoredData: ignored,
      calculations: [
        `Coût du détour = ${best.c.detourDistanceKm} km × ${consumption} L/100 km / 100 × ${best.c.station.price} €/L = ${best.detourCost} €.`,
        `Économie brute = (${reference.price} − ${best.c.station.price}) × ${quantity} L = ${best.grossSavings} €.`,
        `Économie nette = ${best.grossSavings} − ${best.detourCost} = ${best.netSavings} €.`
      ],
      assumptions,
      freshness,
      isPartial
    }
  }

  if (costs.length === 0) {
    return {
      type: 'insufficient-data',
      confidence: 0,
      quantityToBuy: null,
      recommendedStation: null,
      referenceStation: reference,
      detourCost: null,
      grossSavings: null,
      netSavings: null,
      reasons: ['Données insuffisantes : aucune station candidate avec un prix récent et cohérent.'],
      usedData: [],
      ignoredData: ignored,
      calculations: [],
      assumptions: [
        'Aucun prix de carburant exploitable pour cette zone.',
        'Suggestions : élargir le rayon de recherche, ou changer de carburant.'
      ],
      freshness,
      isPartial: true
    }
  }

  // Réservoir critique (≤ 10 % capacité) → fill-now, même en tendance baissière.
  const levelRatio = level / input.vehicle.tankCapacity
  if (levelRatio <= CRITICAL_LEVEL_RATIO) {
    return {
      type: 'fill-now',
      confidence: hasStale ? 0.7 : 0.9,
      quantityToBuy: available,
      recommendedStation: null,
      referenceStation: reference,
      detourCost: null,
      grossSavings: null,
      netSavings: null,
      reasons: ['Réservoir presque vide : il est prudent de faire le plein maintenant.', ...reasonsBase],
      usedData: ['Prix officiels les plus récents pour ce carburant.'],
      ignoredData: ignored,
      calculations: [`Volume disponible = ${input.vehicle.tankCapacity} − ${level} = ${available} L.`],
      assumptions,
      freshness,
      isPartial
    }
  }

  // Niveau élevé (≥ 80 %) : pas de besoin immédiat → wait, jamais fill-now.
  if (levelRatio >= HIGH_LEVEL_RATIO) {
    return {
      type: 'wait',
      confidence: hasStale ? 0.7 : 0.9,
      quantityToBuy: null,
      recommendedStation: null,
      referenceStation: reference,
      detourCost: null,
      grossSavings: null,
      netSavings: null,
      reasons: ['Réservoir suffisamment plein : tu peux attendre.', ...reasonsBase],
      usedData: ['Prix officiels les plus récents pour ce carburant.'],
      ignoredData: ignored,
      calculations: ['Aucun détour ne rentabilise l’économie.'],
      assumptions,
      freshness,
      isPartial
    }
  }

  // Sinon wait / partial-fill selon la quantité et le meilleur candidat.
  if (bestCandidate !== undefined && input.quantityToBuy > 0) {
    const diffPerLiter = reference.price - bestCandidate.c.station.price
    const minQuantity = diffPerLiter > 0 ? Math.ceil((input.threshold + bestCandidate.detourCost) / diffPerLiter) : Number.POSITIVE_INFINITY
    const maxAllowed = Math.min(available, input.vehicle.preferredQuantity ?? Infinity)
    const X = Math.min(maxAllowed, minQuantity)

    if (diffPerLiter > 0 && X > 0 && minQuantity <= maxAllowed) {
      return {
        type: 'partial-fill',
        confidence: hasStale ? 0.7 : 0.9,
        quantityToBuy: X,
        recommendedStation: bestCandidate.c.station,
        referenceStation: reference,
        detourCost: bestCandidate.detourCost,
        grossSavings: diffPerLiter * X,
        netSavings: diffPerLiter * X - bestCandidate.detourCost,
        reasons: ['Le plein complet ne rentabilise pas le détour, mais un plein partiel suffit.', ...reasonsBase],
        usedData: ['Prix officiels les plus récents pour ce carburant.'],
        ignoredData: ignored,
        calculations: [
          `Quantité minimale rentabilisant le détour = ⌈(${input.threshold} + ${bestCandidate.detourCost}) / ${diffPerLiter}⌉ = ${minQuantity} L.`,
          `Quantité recommandée = min(${minQuantity}, ${maxAllowed}) = ${X} L.`
        ],
        assumptions,
        freshness,
        isPartial: true
      }
    }
  }

  // Attente : remplir netSavings/detourCost du meilleur candidat pour
  // l'explicabilité (ticket #1 : « netSavings et detourCost présents »).
  return {
    type: 'wait',
    confidence: hasStale ? 0.7 : 0.9,
    quantityToBuy: null,
    recommendedStation: null,
    referenceStation: reference,
    detourCost: bestCandidate?.detourCost ?? null,
    grossSavings: bestCandidate?.grossSavings ?? null,
    netSavings: bestCandidate?.netSavings ?? null,
    reasons: ['Aucun détour rentable pour l’instant.', ...reasonsBase],
    usedData: ['Prix officiels les plus récents pour ce carburant.'],
    ignoredData: ignored,
    calculations: ['Aucun détour ne rentabilise l’économie.'],
    assumptions,
    freshness,
    isPartial
  }
}
