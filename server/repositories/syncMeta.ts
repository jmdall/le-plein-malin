// server/repositories/syncMeta.ts — Accès last_sync (spec §8 /api/health,
// §9.6, ticket 008). Enregistre la dernière synchronisation réussie (source +
// horodatage) ; /api/health la lit pour répondre `{ status, lastSync }`.
// Sans règle métier.
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { lastSync } from '../db/schema'

export const LAST_SYNC_KEY = 'prices'

export interface LastSyncRow {
  key: string
  syncedAt: Date
  source: string
  updatedAt: Date
}

export function createSyncMetaRepository(db: Db) {
  return {
    // Upsert du dernier succès (une seule ligne, `key` = 'prices').
    async set(syncedAt: Date, source: string): Promise<void> {
      await db
        .insert(lastSync)
        .values({ key: LAST_SYNC_KEY, syncedAt, source, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: lastSync.key,
          set: { syncedAt, source, updatedAt: new Date() }
        })
    },

    // Dernier succès, ou undefined si jamais synchronisé.
    async get(): Promise<LastSyncRow | undefined> {
      const row = await db
        .select()
        .from(lastSync)
        .where(eq(lastSync.key, LAST_SYNC_KEY))
        .get()
      return row
    }
  }
}
