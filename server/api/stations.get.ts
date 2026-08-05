// server/api/stations.get.ts — GET /api/stations (ticket 009, spec §8).
// Liste des stations dans le rayon, avec distances calculées côté serveur
// (haversine pure, D3) et station de référence (la plus proche du centre,
// ADR-0002/D2). La position précise de l'utilisateur n'est jamais persistée
// ni loggée (LOC-4, NFR-SEC-4).
import { baseLocationSchema } from '../lib/validation'
import { createDb } from '../db/client'
import { createFallbackChain } from '../providers'
import { createOpendatasoftProvider } from '../providers/opendatasoft'
import { createJsonExportProvider } from '../providers/jsonExport'
import { createRoulezEcoProvider } from '../providers/roulezoeco'
import { createCacheProvider } from '../providers/cacheProvider'
import { createGeocodeProvider } from '../lib/geocode'
import {
  buildStationsList,
  createApiError,
  isApiError,
  loadDefaultVehicleProfile,
  resolveCenter
} from '../lib/orchestration'

export default defineEventHandler(async (event) => {
  const { db, sqlite } = createDb()
  try {
    const query = getQuery(event)

    // 1. Validation Zod stricte (NFR-SEC-2) → erreur structurée 400.
    const parsed = baseLocationSchema.safeParse(query)
    if (!parsed.success) {
      throw createApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]!.message)
    }

    // 2. Chaîne de repli des fournisseurs (ADR-0003) sur la base locale.
    const provider = createFallbackChain({
      providers: [
        createOpendatasoftProvider(),
        createJsonExportProvider(),
        createRoulezEcoProvider(),
        createCacheProvider(db)
      ],
      onError: (name, error) => {
        console.error(`[stations] provider ${name} indisponible :`, error)
      }
    })

    // 3. Résolution du centre (lat/lon, ou géocodage ville/CP avec cache).
    const geocode = createGeocodeProvider(db)
    const center = await resolveCenter({ query: parsed.data, geocode })

    // 4. Profil véhicule par défaut en base (pour la quantité d'économie
    //    brute/nette affichée en liste, spec §5.5). VEH-4 : jamais bloquant.
    let vehicle:
      | { consumption: number; currentLevel: number; tankCapacity: number }
      | undefined
    try {
      const profile = await loadDefaultVehicleProfile(db)
      vehicle = {
        consumption: profile.consumption,
        currentLevel: profile.currentLevel,
        tankCapacity: profile.tankCapacity
      }
    } catch {
      vehicle = undefined
    }

    // 5. Orchestration enrichie (ticket 011) : haversine + référence + STA-1.
    //    L'identité réelle (nom/enseigne/logo, 019/020) est réinjectée depuis
    //    la base : le client n'affiche jamais l'id (REC-2/D1).
    const response = await buildStationsList({
      provider,
      query: parsed.data,
      center,
      db,
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
