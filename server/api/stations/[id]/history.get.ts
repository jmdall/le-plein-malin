// server/api/stations/[id]/history.get.ts — GET /api/stations/:id/history
// (ticket 009, §8). Tendance d'une station/carburant : calculée par le module
// pur domain/trend (005) sur l'historique local SQLite (ADR-0004). Validation
// Zod sur le paramètre fuel (NFR-SEC-2). Aucune règle métier testée ici.
import { historyQuerySchema, stationIdSchema } from '../../../lib/validation'
import { createDb } from '../../../db/client'
import {
  buildTrendResponse,
  createApiError,
  isApiError
} from '../../../lib/orchestration'

export default defineEventHandler(async (event) => {
  const { db, sqlite } = createDb()
  try {
    const id = getRouterParam(event, 'id')
    const idParsed = stationIdSchema.safeParse(id)
    if (!idParsed.success) {
      throw createApiError(400, 'VALIDATION_ERROR', idParsed.error.issues[0]!.message)
    }

    const query = getQuery(event)
    const parsed = historyQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw createApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]!.message)
    }

    const response = await buildTrendResponse({
      db,
      id: idParsed.data,
      fuel: parsed.data.fuel
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
