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

// Type de la transaction du driver better-sqlite3 (callback synchrone de
// `db.transaction`). Le job de sync écrit dans une transaction unique déjà
// ouverte : les repos acceptent `Db | Tx` en premier paramètre d'`upsertMany`.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// Une connexion SQLite utilisable pour écrire : la base, ou une transaction
// déjà ouverte (le job). Mêmes méthodes d'insertion (Drizzle), mêmes types.
export type DbOrTx = Db | Tx

// `set` du ON CONFLICT DO UPDATE de stations. Chaque ligne du lot porte son
// propre statut « identité par défaut » (nom = id, brand = null) : une ligne
// par défaut CONSERVE la valeur précédente en base (on ne remplace jamais un
// nom réel par un id/null — invariant CONTEXT.md), une ligne réellement
// enrichie écrase les quatre colonnes d'identité. `excluded.` référence la
// ligne proposée par le INSERT multi-VALUES, `stations.` la ligne en conflit.
const stationConflictSet = {
  name: sql`CASE WHEN excluded.name = excluded.id AND excluded.brand IS NULL THEN stations.name ELSE excluded.name END`,
  brand: sql`CASE WHEN excluded.name = excluded.id AND excluded.brand IS NULL THEN stations.brand ELSE excluded.brand END`,
  brandWikidataId: sql`coalesce(excluded.brand_wikidata_id, stations.brand_wikidata_id)`,
  logoUrl: sql`coalesce(excluded.logo_url, stations.logo_url)`,
  address: sql`excluded.address`,
  city: sql`excluded.city`,
  postalCode: sql`excluded.postal_code`,
  latitude: sql`excluded.latitude`,
  longitude: sql`excluded.longitude`,
  departmentCode: sql`excluded.department_code`,
  regionCode: sql`excluded.region_code`,
  closed: sql`excluded.closed`,
  syncedAt: sql`excluded.synced_at`
}

export function createStationsRepository(db: DbOrTx) {
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

    // Upsert en lot : un seul INSERT ... ON CONFLICT DO UPDATE multi-VALUES
    // (NFR-PERF : ~100-500× plus rapide qu'une boucle d'upserts unitaires).
    // better-sqlite3 est synchrone : la requête est exécutée immédiatement (le
    // `await` absent ne la diffère pas — QueryPromise.execute() appelle .run()
    // de façon synchrone). Appelé depuis un callback de db.transaction (lui
    // aussi synchrone), l'écriture se fait DANS la transaction ouverte.
    async upsertMany(tx: DbOrTx, rows: Array<StationUpsertRow>): Promise<void> {
      if (rows.length === 0) return
      tx
        .insert(stations)
        .values(rows)
        .onConflictDoUpdate({ target: stations.id, set: stationConflictSet })
        .run()
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
