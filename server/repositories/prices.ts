// server/repositories/prices.ts — Accès prices (spec §9.2). Sans règle métier.
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { prices, stations } from '../db/schema'

export interface PriceRow {
  stationId: string
  fuel: string
  price: number
  updatedAt: Date
  rupture: boolean
  syncedAt: Date
}

export interface StationPriceInRadius {
  id: string
  name: string
  brand: string | null
  address: string
  city: string
  postalCode: string
  latitude: number
  longitude: number
  closed: boolean
  syncedAt: Date
  fuel: string
  price: number
  updatedAt: Date
  rupture: boolean
  distanceKm: number
}

const EARTH_RADIUS_KM = 6371
const TO_RADIANS = Math.PI / 180

// Haversine calculée en SQL (serveur) : la géométrie vit côté accès,
// jamais dans le domaine pur. Le module pur reçoit des distances en km.
function haversineSql(lat: number, lon: number): unknown {
  return sql`2 * ${EARTH_RADIUS_KM} * asin(
    sqrt(
      pow(sin((stations.latitude - ${lat}) * ${TO_RADIANS} / 2), 2)
      + cos(stations.latitude * ${TO_RADIANS})
        * cos(${lat} * ${TO_RADIANS})
        * pow(sin((stations.longitude - ${lon}) * ${TO_RADIANS} / 2), 2)
    )
  )`
}

export function createPricesRepository(db: Db) {
  return {
    async upsert(row: PriceRow): Promise<void> {
      await db
        .insert(prices)
        .values(row)
        .onConflictDoUpdate({
          target: [prices.stationId, prices.fuel],
          set: {
            price: row.price,
            updatedAt: row.updatedAt,
            rupture: row.rupture,
            syncedAt: row.syncedAt
          }
        })
    },

    async upsertMany(rows: PriceRow[]): Promise<void> {
      for (const row of rows) {
        await this.upsert(row)
      }
    },

    async findByStation(stationId: string): Promise<PriceRow[]> {
      return db
        .select()
        .from(prices)
        .where(eq(prices.stationId, stationId))
        .all()
    },

    async findByStationAndFuel(stationId: string, fuel: string): Promise<PriceRow | undefined> {
      const row = await db
        .select()
        .from(prices)
        .where(and(eq(prices.stationId, stationId), eq(prices.fuel, fuel)))
        .get()
      return row
    },

    // Lecture par (fuel, rayon, centre) : jointure stations × prices + distance
    // haversine calculée côté serveur. Exclut fermetures et ruptures.
    async findByFuelInRadius(
      fuel: string,
      lat: number,
      lon: number,
      radiusKm: number
    ): Promise<StationPriceInRadius[]> {
      return db
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
          rupture: prices.rupture,
          distanceKm: sql<number>`${haversineSql(lat, lon)}`
        })
        .from(prices)
        .innerJoin(stations, eq(prices.stationId, stations.id))
        .where(
          and(
            eq(prices.fuel, fuel),
            eq(stations.closed, false),
            eq(prices.rupture, false),
            sql`${haversineSql(lat, lon)} <= ${radiusKm}`
          )
        )
        .all()
    }
  }
}
