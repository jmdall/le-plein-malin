// server/api/health.get.ts — Health-check (spec §8, ticket 008). Répond
// `{ status, lastSync }` où lastSync est la dernière synchronisation réussie
// du job (table last_sync, servie par createSyncMetaRepository). Jamais de
// coordonnées ni de données sensibles.
import { createDb } from '../db/client'
import { createSyncMetaRepository, LAST_SYNC_KEY } from '../repositories/syncMeta'

export default defineEventHandler(async () => {
  const { db, sqlite } = createDb()
  try {
    const metaRepo = createSyncMetaRepository(db)
    const last = await metaRepo.get()

    if (!last) {
      return { status: 'ok', lastSync: null }
    }

    return {
      status: 'ok',
      lastSync: {
        key: last.key === LAST_SYNC_KEY ? 'prices' : last.key,
        syncedAt: last.syncedAt.toISOString(),
        source: last.source,
        updatedAt: last.updatedAt.toISOString()
      }
    }
  } finally {
    sqlite.close()
  }
})
