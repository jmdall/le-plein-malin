// tests/helpers/db.ts — Base SQLite temporaire pour les tests d'intégration.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '../../server/db/client'

export function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'je-fais-le-plein-ou-non-'))
  const dbPath = join(dir, 'test.db')
  const { sqlite, db } = createDb(dbPath)
  migrate(db, { migrationsFolder: 'server/db/migrations' })
  return {
    sqlite,
    db,
    dbPath,
    close() {
      sqlite.close()
    }
  }
}
