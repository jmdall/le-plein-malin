// server/api/sync.post.ts — POST /api/sync : déclenche une synchronisation
// immédiate de la base avec la source officielle.
//
// Paramètres optionnels (validation Zod, NFR-SEC-2) :
//   lat / lon + radiusKm : synchronisation locale rapide (ex. 30 km autour de
//   Paris → ~15 s). La chaîne records (paginée) est alors prioritaire.
//   Sans paramètre : synchronisation France entière via l'export JSON complet
//   (lent : ~5-15 min sur un Raspberry Pi — 6 × 115 Mo décompressés).
//
// Retourne les compteurs réels du job ; aucune donnée inventée (le job
// n'upsert que ce que le provider a réellement renvoyé).
import { z } from 'zod'
import { createDb } from '../db/client'
import { createFallbackChain } from '../providers'
import { createOpendatasoftProvider } from '../providers/opendatasoft'
import { createJsonExportProvider } from '../providers/jsonExport'
import { createRoulezEcoProvider } from '../providers/roulezoeco'
import { createCacheProvider } from '../providers/cacheProvider'
import { createSyncPricesJob } from '../jobs/syncPrices'
import { latSchema, lonSchema } from '../lib/validation'

const syncQuerySchema = z
  .object({
    lat: latSchema.optional(),
    lon: lonSchema.optional(),
    radiusKm: z.coerce
      .number()
      .int({ error: 'radiusKm doit être un entier' })
      .min(5, { error: 'radiusKm doit être ≥ 5' })
      .max(900, { error: 'radiusKm doit être ≤ 900' })
      .optional()
  })
  .superRefine((value, ctx) => {
    const hasLat = value.lat !== undefined
    const hasLon = value.lon !== undefined
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lat'],
        message: 'lat et lon doivent être fournis ensemble'
      })
    }
  })

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const parsed = syncQuerySchema.safeParse(query)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Paramètres invalides'
    throw createError({ statusCode: 400, statusMessage: message, data: { error: { code: 'VALIDATION_ERROR', message } } })
  }

  const { db, sqlite } = createDb()
  try {
    const hasLocal = parsed.data.lat !== undefined && parsed.data.lon !== undefined && parsed.data.radiusKm !== undefined
    const center = hasLocal
      ? { lat: parsed.data.lat as number, lon: parsed.data.lon as number }
      : { lat: 46.5, lon: 2.5 }
    const radiusKm = parsed.data.radiusKm ?? 900

    // Rayon local (≤ 100 km) : l'API records paginée est rapide et précise.
    // France entière : l'export JSON complet est prioritaire (la pagination
    // est plafonnée à 3000 records/carburant).
    const provider = createFallbackChain({
      providers: radiusKm <= 100
        ? [
            createOpendatasoftProvider(),
            createJsonExportProvider(),
            createRoulezEcoProvider(),
            createCacheProvider(db)
          ]
        : [
            createJsonExportProvider(),
            createOpendatasoftProvider(),
            createRoulezEcoProvider(),
            createCacheProvider(db)
          ],
      onError: (name, error) => {
        console.error(`[sync-manual] provider ${name} indisponible :`, error)
      }
    })

    const job = createSyncPricesJob({ db, provider, center, radiusKm })
    const result = await job.run()

    return { ok: true, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync-manual] échec :', error)
    throw createError({
      statusCode: 500,
      statusMessage: message,
      data: { error: { code: 'SYNC_FAILED', message } }
    })
  } finally {
    sqlite.close()
  }
})
