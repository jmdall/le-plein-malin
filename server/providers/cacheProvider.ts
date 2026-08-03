// server/providers/cacheProvider.ts — Repli priorité 4 (ADR-0003) : le dernier
// état connu dans SQLite (stations + prices, ADR-0003, recherche §11–12).
// Règles de fraîcheur : TTL de 1 h minimum (NFR-SEC-3) ; un cache de plus de
// 24 h n'est jamais servi sans signalement explicite (FRE-2) — le champ
// `syncedAt` retourné permet d'afficher « données en cache (date) ».
import type { Db } from '../db/client'
import { prices, stations } from '../db/schema'
import { eq, and, desc as drizzleDesc } from 'drizzle-orm'
import type { FuelType, StationPrice } from '../../domain/fuel-prices/types'
import { haversineKm } from '../../domain/fuel-prices/haversine'
import type {
  FuelPriceProvider,
  NearbyStationQuery,
  ProviderResult
} from './types'

export const CACHE_TTL_MS = 60 * 60 * 1000 // 1 h — seuil de « données en cache » (badge) appliqué par l'appelant via syncedAt
export const CACHE_MAX_AGE_WITHOUT_BADGE_MS = 24 * 60 * 60 * 1000 // 24 h — refus dur (FRE-2)

export interface CacheOptions {
  now?: () => Date
  maxAgeWithoutBadgeMs?: number
}

export function createCacheProvider(
  db: Db,
  options: CacheOptions = {}
): FuelPriceProvider {
  const nowFn = options.now ?? (() => new Date())
  const maxAgeWithoutBadgeMs =
    options.maxAgeWithoutBadgeMs ?? CACHE_MAX_AGE_WITHOUT_BADGE_MS

  return {
    name: 'cache',

    async findNearbyStations(query: NearbyStationQuery): Promise<ProviderResult> {
      const now = nowFn()

      // Fraîcheur du cache : le synced_at le plus récent des prix de la
      // requête. Si le cache n'est pas dans le TTL, il n'est pas servi
      // automatiquement (le repli demandera une source plus fraîche).
      const latestRow = await db
        .select({ syncedAt: stations.syncedAt })
        .from(prices)
        .innerJoin(stations, eq(prices.stationId, stations.id))
        .where(
          and(
            eq(prices.fuel, query.fuel),
            eq(prices.rupture, false),
            eq(stations.closed, false)
          )
        )
        .orderBy(drizzleDesc(stations.syncedAt))
        .get()

      const lastSynced = latestRow ? latestRow.syncedAt : undefined
      if (!lastSynced) {
        throw new Error('Cache : aucune donnée synchronisée pour ce carburant')
      }

      const ageMs = now.getTime() - lastSynced.getTime()

      // FRE-2 : un cache de plus de 24 h n'est jamais servi sans signalement
      // explicite — on refuse ici (le signalement est géré en amont de la
      // chaîne, qui décide s'il est acceptable d'afficher un badge).
      if (ageMs > maxAgeWithoutBadgeMs) {
        throw new Error(
          `Cache : données plus anciennes que ${Math.floor(maxAgeWithoutBadgeMs / 3_600_000)} h (${lastSynced.toISOString()}) — service refusé sans signalement`
        )
      }

      const rows = await db
        .select({
          id: stations.id,
          name: stations.name,
          brand: stations.brand,
          address: stations.address,
          city: stations.city,
          postalCode: stations.postalCode,
          latitude: stations.latitude,
          longitude: stations.longitude,
          closed: stations.closed,
          syncedAt: stations.syncedAt,
          fuel: prices.fuel,
          price: prices.price,
          updatedAt: prices.updatedAt,
          rupture: prices.rupture
        })
        .from(prices)
        .innerJoin(stations, eq(prices.stationId, stations.id))
        .where(
          and(
            eq(prices.fuel, query.fuel),
            eq(prices.rupture, false),
            eq(stations.closed, false)
          )
        )
        .all()

      const { lat, lon } = query.center
      const stationsOut: StationPrice[] = []

      for (const row of rows) {
        const position = { lat: row.latitude, lon: row.longitude }
        if (haversineKm({ lat, lon }, position) > query.radiusKm) continue
        stationsOut.push({
          id: row.id,
          name: row.name,
          brand: row.brand,
          address: row.address,
          city: row.city,
          postalCode: row.postalCode,
          position,
          fuel: query.fuel as FuelType,
          price: row.price,
          updatedAt: row.updatedAt
        })
      }

      return {
        stations: stationsOut,
        source: 'cache',
        syncedAt: lastSynced
      }
    }
  }
}
