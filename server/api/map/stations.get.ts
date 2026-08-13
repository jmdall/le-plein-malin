// server/api/map/stations.get.ts — GET /api/map/stations (ticket 037).
// Stations d'une EMPRISE, pour que la carte puisse afficher une zone entière
// sans que les stations disparaissent au déplacement. Question distincte de
// /api/stations (par rayon) : ici aucune grandeur d'économie n'est calculée —
// hors rayon il n'y a pas de station de référence, donc pas d'économie nette.
//
// Aucune position utilisateur ne transite : l'emprise vient de la carte
// (LOC-4, NFR-SEC-4).
import { mapBoundsSchema } from '../../lib/validation'
import { createDb } from '../../db/client'
import { createApiError, isApiError } from '../../lib/api-errors'
import { buildMapStationsResponse } from '../../lib/map-stations'

export default defineEventHandler(async (event) => {
  const { db, sqlite } = createDb()
  try {
    // Validation Zod stricte (NFR-SEC-2) : bornes France + emprise cohérente.
    const parsed = mapBoundsSchema.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]!.message)
    }

    const { swLat, swLon, neLat, neLon, fuel } = parsed.data
    return await buildMapStationsResponse({
      db,
      bounds: { swLat, swLon, neLat, neLon },
      fuel
    })
  } catch (error) {
    if (isApiError(error)) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.body.error.message,
        data: error.body
      })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw createError({
      statusCode: 500,
      statusMessage: message,
      data: { error: { code: 'INTERNAL_ERROR', message } }
    })
  } finally {
    sqlite.close()
  }
})
