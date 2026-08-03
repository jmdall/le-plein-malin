// tests/unit/sync-meta.spec.ts — Tests du repository last_sync (ticket 008,
// spec §8 /api/health). Sur base SQLite temporaire.
import { describe, expect, it, afterEach } from 'vitest'
import { createTestDb } from '../helpers/db'
import { createSyncMetaRepository, LAST_SYNC_KEY } from '../../server/repositories/syncMeta'

let dbHandle: ReturnType<typeof createTestDb> | undefined

afterEach(() => {
  dbHandle?.close()
  dbHandle = undefined
})

describe('repository last_sync (spec §8 /api/health)', () => {
  it('get() sans synchronisation → undefined', async () => {
    const { db } = (dbHandle = createTestDb())
    const repo = createSyncMetaRepository(db)
    expect(await repo.get()).toBeUndefined()
  })

  it('set() upsert : écrit, puis met à jour sans dupliquer (singleton)', async () => {
    const { db, sqlite } = (dbHandle = createTestDb())
    const repo = createSyncMetaRepository(db)

    await repo.set(new Date('2026-08-03T10:00:00Z'), 'opendatasoft-api')
    await repo.set(new Date('2026-08-03T12:00:00Z'), 'roulez-eco')

    const last = await repo.get()
    expect(last?.key).toBe(LAST_SYNC_KEY)
    expect(last?.syncedAt).toEqual(new Date('2026-08-03T12:00:00Z'))
    expect(last?.source).toBe('roulez-eco')

    const { count } = sqlite.prepare('SELECT count(*) AS count FROM last_sync').get() as { count: number }
    expect(count).toBe(1)
  })
})
