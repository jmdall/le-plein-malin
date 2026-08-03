// server/repositories/priceHistory.ts — Accès price_history (spec §9.3, ADR-0004).
// Upsert quotidien par (station_id, fuel, day). Sans règle métier.
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { priceHistory } from '../db/schema'

export interface PriceHistoryRow {
  stationId: string
  fuel: string
  day: string // YYYY-MM-DD
  price: number
  syncedAt: Date
}

export interface DayPrice {
  day: string
  price: number
}

export function createPriceHistoryRepository(db: Db) {
  return {
    async upsert(row: PriceHistoryRow): Promise<void> {
      await db
        .insert(priceHistory)
        .values(row)
        .onConflictDoUpdate({
          target: [priceHistory.stationId, priceHistory.fuel, priceHistory.day],
          set: {
            price: row.price,
            syncedAt: row.syncedAt
          }
        })
    },

    async upsertMany(rows: PriceHistoryRow[]): Promise<void> {
      for (const row of rows) {
        await this.upsert(row)
      }
    },

    // Historique quotidien (J−0 → J−n) d'une station/carburant, trié par jour croissant.
    async findByStationAndFuel(stationId: string, fuel: string): Promise<DayPrice[]> {
      const rows = await db
        .select({ day: priceHistory.day, price: priceHistory.price })
        .from(priceHistory)
        .where(and(eq(priceHistory.stationId, stationId), eq(priceHistory.fuel, fuel)))
        .orderBy(priceHistory.day)
        .all()
      return rows
    },

    async count(): Promise<number> {
      const { count } = await db
        .select({ count: sql<number>`count(*)` })
        .from(priceHistory)
        .get()!
      return count
    }
  }
}
