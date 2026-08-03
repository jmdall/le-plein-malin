// server/repositories/favorites.ts — Accès favorites (spec §9.5). Sans règle métier.
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { favorites } from '../db/schema'

export interface FavoriteRow {
  stationId: string
  createdAt: Date
}

export function createFavoritesRepository(db: Db) {
  return {
    async add(stationId: string): Promise<void> {
      await db
        .insert(favorites)
        .values({ stationId, createdAt: new Date() })
        .onConflictDoNothing()
    },

    async remove(stationId: string): Promise<void> {
      await db.delete(favorites).where(eq(favorites.stationId, stationId))
    },

    async findByStation(stationId: string): Promise<FavoriteRow | undefined> {
      const row = await db
        .select()
        .from(favorites)
        .where(eq(favorites.stationId, stationId))
        .get()
      return row
    },

    async list(): Promise<FavoriteRow[]> {
      return db.select().from(favorites).all()
    }
  }
}
