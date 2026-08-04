// server/db/schema.ts — Schéma SQLite (Drizzle) conforme spec §9.
// Aucune règle métier ici : uniquement la forme de la persistance.
import { sqliteTable, text, real, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'

export const stations = sqliteTable('stations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  brand: text('brand'),
  brandWikidataId: text('brand_wikidata_id'),
  logoUrl: text('logo_url'),
  address: text('address').notNull(),
  city: text('city').notNull(),
  postalCode: text('postal_code').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  departmentCode: text('department_code'),
  regionCode: text('region_code'),
  closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull()
})

export const prices = sqliteTable(
  'prices',
  {
    stationId: text('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    fuel: text('fuel').notNull(),
    price: real('price').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    rupture: integer('rupture', { mode: 'boolean' }).notNull().default(false),
    syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.stationId, table.fuel] }),
    index('idx_prices_station_fuel').on(table.stationId, table.fuel)
  ]
)

export const priceHistory = sqliteTable(
  'price_history',
  {
    stationId: text('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    fuel: text('fuel').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD — snapshot quotidien (ADR-0004)
    price: real('price').notNull(),
    syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.stationId, table.fuel, table.day] }),
    index('idx_price_history_fuel_day').on(table.fuel, table.day)
  ]
)

export const vehicleProfile = sqliteTable('vehicle_profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fuel: text('fuel').notNull(),
  consumption: real('consumption').notNull(),
  tankCapacity: real('tank_capacity').notNull(),
  currentLevel: real('current_level').notNull(),
  preferredQuantity: real('preferred_quantity'),
  savingsThreshold: real('savings_threshold').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const favorites = sqliteTable('favorites', {
  stationId: text('station_id')
    .primaryKey()
    .references(() => stations.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// Métadonnées de synchronisation (spec §8 /api/health, §9.6, ticket 008).
// Singleton : la dernière synchronisation réussie est lue par /api/health.
export const lastSync = sqliteTable('last_sync', {
  key: text('key').primaryKey(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
  source: text('source').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
