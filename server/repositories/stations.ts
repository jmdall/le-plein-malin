// server/repositories/stations.ts — Accès stations (spec §9.1). Sans règle métier.
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { stations } from '../db/schema'

export interface StationRow {
  id: string
  name: string
  brand: string | null
  brandWikidataId: string | null
  logoUrl: string | null
  address: string
  city: string
  postalCode: string
  latitude: number
  longitude: number
  departmentCode: string | null
  regionCode: string | null
  closed: boolean
  syncedAt: Date
}

// Entrée d'upsert : les colonnes d'enrichissement (017-019) sont optionnelles —
// les insertions existantes (sync, favoris, tests) compilent sans les fournir.
// Si absentes, la valeur existante en base est conservée (upsert sans perte).
export type StationUpsertRow = Omit<StationRow, 'id' | 'brandWikidataId' | 'logoUrl'> & {
  id: string
  brandWikidataId?: string | null
  logoUrl?: string | null
}

export function createStationsRepository(db: Db) {
  return {
    async upsert(row: StationUpsertRow): Promise<void> {
      await db
        .insert(stations)
        .values(row)
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name: row.name,
            brand: row.brand,
            brandWikidataId: row.brandWikidataId ?? sql`brand_wikidata_id`,
            logoUrl: row.logoUrl ?? sql`logo_url`,
            address: row.address,
            city: row.city,
            postalCode: row.postalCode,
            latitude: row.latitude,
            longitude: row.longitude,
            departmentCode: row.departmentCode,
            regionCode: row.regionCode,
            closed: row.closed,
            syncedAt: row.syncedAt
          }
        })
    },

    async upsertMany(rows: Array<StationUpsertRow>): Promise<void> {
      for (const row of rows) {
        await this.upsert(row)
      }
    },

    async findById(id: string): Promise<StationRow | undefined> {
      const row = await db.select().from(stations).where(eq(stations.id, id)).get()
      return row
    },

    async count(): Promise<number> {
      const { count } = await db
        .select({ count: sql<number>`count(*)` })
        .from(stations)
        .get()!
      return count
    }
  }
}
