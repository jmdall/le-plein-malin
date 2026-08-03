// server/db/client.ts — Connexion SQLite (better-sqlite3) + migration.
// Emplacement de la base piloté par DATABASE_PATH (défaut ./data/app.db).
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'node:path'

export function createDb(dbPath = process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data/app.db')) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return { sqlite, db: drizzle(sqlite) }
}

export type Db = ReturnType<typeof createDb>['db']
