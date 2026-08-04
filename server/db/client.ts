// server/db/client.ts — Connexion SQLite (better-sqlite3).
// Emplacement de la base piloté par DATABASE_PATH (défaut ./data/app.db).
// Le dossier parent est créé à la connexion : le serveur démarre même si la
// base n'existe pas encore (premier lancement, e2e).
// ⚠️ Les migrations NE sont PAS exécutées ici : elles sont appliquées au
// démarrage par server/plugins/migrate.ts (ou manuellement via `npm run
// db:migrate`).
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

export function createDb(dbPath = process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data/app.db')) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return { sqlite, db: drizzle(sqlite) }
}

export type Db = ReturnType<typeof createDb>['db']
