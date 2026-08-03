// server/api/recommendation.get.ts — GET /api/recommendation (ticket 009, §8).
// Recommandation complète : mêmes params que /api/stations + vehicleProfile.
// L'API n'appelle la logique métier qu'avec des distances déjà calculées
// (spec §10.4) : aucun recalcul de règle ici. La position précise n'est
// jamais persistée ni loggée (LOC-4, NFR-SEC-4).
import { recommendationQuerySchema } from '../lib/validation'
import { createDb } from '../db/client'
import { createFallbackChain } from '../providers'
import { createOpendatasoftProvider } from '../providers/opendatasoft'
import { createJsonExportProvider } from '../providers/jsonExport'
import { createRoulezEcoProvider } from '../providers/roulezoeco'
import { createCacheProvider } from '../providers/cacheProvider'
import { createGeocodeProvider } from '../lib/geocode'
import {
  buildRecommendationResponse,
  createApiError,
  isApiError,
  loadDefaultVehicleProfile,
  resolveCenter,
  toDomainVehicle
} from '../lib/orchestration'

export default defineEventHandler(async (event) => {
  const { db, sqlite } = createDb()
  try {
    const query = getQuery(event)

    // 1. Validation Zod stricte (NFR-SEC-2) → erreur structurée 400.
    const parsed = recommendationQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw createApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]!.message)
    }

    // 2. Profil véhicule : fourni (validé) ou profil par défaut en base (VEH-4).
    const vehicle = parsed.data.vehicleProfile
      ? toDomainVehicle(parsed.data.vehicleProfile)
      : await loadDefaultVehicleProfile(db)

    // 3. Chaîne de repli des fournisseurs (ADR-0003).
    const provider = createFallbackChain({
      providers: [
        createOpendatasoftProvider(),
        createJsonExportProvider(),
        createRoulezEcoProvider(),
        createCacheProvider(db)
      ],
      onError: (name, error) => {
        console.error(`[recommendation] provider ${name} indisponible :`, error)
      }
    })

    // 4. Résolution du centre (lat/lon ou ville/CP géocodée avec cache).
    const geocode = createGeocodeProvider(db)
    const center = await resolveCenter({ query: parsed.data, geocode })

    // 5. Orchestration : km pré-calculés + tendance locale injectés (005).
    const response = await buildRecommendationResponse({
      db,
      provider,
      query: parsed.data,
      center,
      vehicle
    })

    return response
  } catch (error) {
    if (isApiError(error)) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.body.error.message, data: error.body })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw createError({ statusCode: 500, statusMessage: message, data: { error: { code: 'INTERNAL_ERROR', message } } })
  } finally {
    sqlite.close()
  }
})
