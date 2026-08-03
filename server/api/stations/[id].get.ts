// server/api/stations/[id].get.ts — GET /api/stations/:id (ticket 009, §8).
// Détail d'une station : station + tous ses prix (par carburant). La position
// précise n'est jamais persistée ni loggée (LOC-4, NFR-SEC-4).
import { stationIdSchema } from '../../lib/validation'
import { createDb } from '../../db/client'
import {
  buildStationDetailResponse,
  createApiError,
  isApiError
} from '../../lib/orchestration'

export default defineEventHandler(async (event) => {
  const { db, sqlite } = createDb()
  try {
    const id = getRouterParam(event, 'id')
    const parsed = stationIdSchema.safeParse(id)
    if (!parsed.success) {
      throw createApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]!.message)
    }

    const response = await buildStationDetailResponse({ db, id: parsed.data })
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
