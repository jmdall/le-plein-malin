// server/plugins/migrate.ts — Applique les migrations SQLite au démarrage
// (ticket 006, DoD « base vierge créée par db:migrate »). Sans cette étape,
// une base neuve (dev, e2e, Docker) n'a AUCUNE table : les routes /api/*
// échouent en 500 « no such table ». La migration tourne une fois, puis la
// connexion est fermée (les routes ouvrent leurs propres connexions via
// createDb).
import { defineNitroPlugin } from 'nitropack/runtime'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { createDb } from '../db/client'

export default defineNitroPlugin(async () => {
  // Dossier des migrations : en dev et en exécution depuis la racine du dépôt,
  // c'est <cwd>/server/db/migrations (le Dockerfile copie aussi ce dossier
  // dans l'image à /app/server/db/migrations, WORKDIR /app).
  const migrationsFolder = resolve(process.cwd(), 'server/db/migrations')
  if (!existsSync(migrationsFolder)) {
    console.warn(`[migrate] dossier de migrations introuvable : ${migrationsFolder} — aucune migration appliquée`)
    return
  }

  try {
    const { db, sqlite } = createDb()
    await migrate(db, { migrationsFolder })
    sqlite.close()
    console.log('[migrate] migrations SQLite appliquées')
  } catch (error) {
    console.error('[migrate] échec de la migration :', error instanceof Error ? error.message : error)
  }
})
