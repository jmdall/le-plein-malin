// server/jobs/syncPrices.ts — Job de synchronisation périodique (ticket 008,
// spec §9.6, ADR-0003, ADR-0004, recherche §12).
//
// Objectif : synchroniser la base avec la source officielle via la chaîne de
// providers (ADR-0003). Étapes :
//   1. interroger la chaîne de repli avec un « rayon large France » (centre sur
//      la France métropolitaine) — jamais un fetch par station (NFR-PERF-2) ;
//   2. upsert des `stations` et des `prices` (transaction unique : aucune
//      écriture partielle douteuse — ADR-0003) ;
//   3. append quotidien de `price_history` : un seul snapshot par
//      (station, carburant, jour), upserté — ADR-0004 / TRE-1 ;
//   4. purge 48 h : les prix dont `prix_maj` est antérieur à 48 h sont
//      neutralisés (rupture=true) : exclus des recommandations mais toujours
//      visibles avec badge (FRE-3, §9.6). La purge ne s'applique qu'aux
//      carburants réellement synchronisés ce tick : un carburant dont la
//      source a échoué n'est jamais modifié (tolérance à l'échec partiel).
//   5. marquage `synced_at` (stations + prices) et de la métadonnée
//      `last_sync` lue par /api/health (ticket 008).
//
// Tolérance à l'échec partiel : si un appel de provider échoue, on garde les
// données existantes de ce carburant et on retente au prochain tick (aucune
// écriture partielle douteuse — ADR-0003). Si tous les carburants échouent,
// rien n'est écrit et une erreur explicite est levée (jamais de prix inventé).
import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { FuelPriceProvider } from '../providers/types'
import { FUEL_TYPES, type FuelType, type StationPrice } from '../../domain/fuel-prices/types'
import { lastSync, priceHistory, prices, stations } from '../db/schema'

// Centre « large France » (métropole) pour la synchronisation complète.
export const FRANCE_CENTER = { lat: 46.5, lon: 2.5 }
// Rayon large (km) : couvre la France métropolitaine (recherche §2, NFR-PERF-2).
export const FRANCE_RADIUS_KM = 900
// Purge : prix dont `prix_maj` est antérieur à 48 h (spec §6, §9.6).
export const OBSOLETE_AFTER_HOURS = 48
export const HOUR_MS = 3_600_000

// Jour local YYYY-MM-DD du snapshot quotidien (ADR-0004).
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface SyncPricesOptions {
  db: Db
  provider: FuelPriceProvider
  // Horloge injectable pour les tests ; défaut : Date.now.
  now?: () => Date
  // Jour du snapshot (injectable pour tester l'append quotidien) ; défaut : aujourd'hui.
  today?: () => Date
  // Rayon / centre de recherche pour la synchronisation (défaut : rayon large France).
  radiusKm?: number
  center?: { lat: number; lon: number }
  onError?: (error: unknown) => void
}

export interface SyncPricesResult {
  stationsSynced: number
  pricesSynced: number
  historyAppended: number
  obsoleteNeutralized: number
  source: string
  syncedAt: Date
  skippedFuels: FuelType[]
}

export function createSyncPricesJob(options: SyncPricesOptions) {
  const { db, provider, now = () => new Date(), today = () => new Date() } = options
  const radiusKm = options.radiusKm ?? FRANCE_RADIUS_KM
  const center = options.center ?? FRANCE_CENTER

  return { run }

  async function run(): Promise<SyncPricesResult> {
    const syncedAt = now()
    const fetched = new Map<FuelType, StationPrice[]>()
    const skipped: Array<{ fuel: FuelType; error: unknown }> = []
    let source = ''

    // 1. Appel provider par carburant (chaîne de repli, ADR-0003). Si un
    //    carburant échoue, on conserve ses données et on retente au prochain
    //    tick — aucune écriture partielle douteuse.
    for (const fuel of FUEL_TYPES) {
      try {
        const result = await provider.findNearbyStations({ center, radiusKm, fuel })
        fetched.set(fuel, result.stations)
        source = result.source
      } catch (error) {
        options.onError?.(error)
        skipped.push({ fuel, error })
      }
    }

    // 2. Tous les carburants ont échoué → rien n'est écrit, erreur explicite
    //    (jamais de prix inventé, ADR-0003).
    if (fetched.size === 0) {
      const detail = skipped.length > 0
        ? `Aucune source disponible pour ${skipped.length} carburant(s)`
        : 'Aucune donnée reçue'
      throw new Error(`Synchronisation échouée : ${detail}`)
    }

    // 3. Run à vide : la source est joignable mais ne renvoie aucun prix
    //    (aucun carburant ne produit de station). Rien n'est écrit, la base
    //    reste cohérente et inchangée.
    const totalReceived = [...fetched.values()].reduce((n, list) => n + list.length, 0)
    if (totalReceived === 0) {
      return {
        stationsSynced: 0,
        pricesSynced: 0,
        historyAppended: 0,
        obsoleteNeutralized: 0,
        source,
        syncedAt,
        skippedFuels: skipped.map((s) => s.fuel)
      }
    }

    // 4. Écriture atomique : une seule transaction. better-sqlite3 exige un
    //    callback synchrone — on exécute les builders drizzle sans `await`.
    const snapshot = db.transaction((tx) => {
      return writeSnapshot(tx, fetched, syncedAt, source)
    })

    return {
      stationsSynced: snapshot.stations,
      pricesSynced: snapshot.prices,
      historyAppended: snapshot.history,
      obsoleteNeutralized: snapshot.obsolete,
      source,
      syncedAt,
      skippedFuels: skipped.map((s) => s.fuel)
    }
  }

  // Écrit l'ensemble (stations + prices + history + purge + last_sync) dans la
  // transaction `tx`. Toutes les opérations sont synchrones (driver
  // better-sqlite3) : si une seule échoue, la transaction est annulée et
  // aucune écriture partielle ne subsiste (tolérance à l'échec partiel).
  function writeSnapshot(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    byFuel: Map<FuelType, StationPrice[]>,
    syncedAt: Date,
    source: string
  ): { stations: number; prices: number; history: number; obsolete: number } {
    const day = dayKey(today())
    let stationsSynced = 0
    let pricesSynced = 0
    let historyAppended = 0
    let obsolete = 0

    // 3a. Upsert des stations (dédupliquées par id, tous carburants confondus).
    const stationById = new Map<string, StationPrice>()
    for (const list of byFuel.values()) {
      for (const s of list) {
        if (!stationById.has(s.id)) stationById.set(s.id, s)
      }
    }
    for (const s of stationById.values()) {
      tx.insert(stations)
        .values({
          id: s.id,
          name: s.name,
          brand: s.brand,
          address: s.address,
          city: s.city,
          postalCode: s.postalCode,
          latitude: s.position.lat,
          longitude: s.position.lon,
          departmentCode: null,
          regionCode: null,
          closed: false,
          syncedAt
        })
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name: s.name,
            brand: s.brand,
            address: s.address,
            city: s.city,
            postalCode: s.postalCode,
            latitude: s.position.lat,
            longitude: s.position.lon,
            departmentCode: null,
            regionCode: null,
            closed: false,
            syncedAt
          }
        })
        .run()
      stationsSynced++
    }

    // 3b. Upsert des prix + append quotidien de l'historique (ADR-0004).
    for (const [fuel, list] of byFuel) {
      for (const s of list) {
        tx.insert(prices)
          .values({
            stationId: s.id,
            fuel,
            price: s.price,
            updatedAt: s.updatedAt,
            rupture: false,
            syncedAt
          })
          .onConflictDoUpdate({
            target: [prices.stationId, prices.fuel],
            set: {
              price: s.price,
              updatedAt: s.updatedAt,
              rupture: false,
              syncedAt
            }
          })
          .run()
        pricesSynced++

        // Snapshot quotidien : un seul par (station, fuel, jour) — upsert.
        tx.insert(priceHistory)
          .values({
            stationId: s.id,
            fuel,
            day,
            price: s.price,
            syncedAt
          })
          .onConflictDoUpdate({
            target: [priceHistory.stationId, priceHistory.fuel, priceHistory.day],
            set: { price: s.price, syncedAt }
          })
          .run()
        historyAppended++
      }
    }

    // 3c. Purge 48 h : seulement pour les carburants réellement synchronisés
    //     ce tick (un carburant en échec garde ses données, intouchées).
    const cutoff = new Date(syncedAt.getTime() - OBSOLETE_AFTER_HOURS * HOUR_MS)
    for (const fuel of byFuel.keys()) {
      const result = tx
        .update(prices)
        .set({ rupture: true, syncedAt: cutoff })
        .where(and(eq(prices.fuel, fuel), lt(prices.updatedAt, cutoff)))
        .run()
      obsolete += result.changes
    }

    // 3d. Métadonnée de synchronisation lue par /api/health. La source réelle
    //     (opendatasoft-api / opendatasoft-export / roulez-eco) permet d'afficher
    //     « données en cache (date) » côté cache (ADR-0003, recherche §13).
    tx.insert(lastSync)
      .values({ key: 'prices', syncedAt, source, updatedAt: syncedAt })
      .onConflictDoUpdate({
        target: lastSync.key,
        set: { syncedAt, source, updatedAt: syncedAt }
      })
      .run()

    return { stations: stationsSynced, prices: pricesSynced, history: historyAppended, obsolete }
  }
}
