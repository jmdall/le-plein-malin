// server/jobs/syncPrices.ts — Job de synchronisation périodique (ticket 008,
// spec §9.6, ADR-0003, ADR-0004, recherche §12).
//
// Objectif : synchroniser la base avec la source officielle via la chaîne de
// providers (ADR-0003). Étapes :
//   1. interroger la chaîne de repli avec un « rayon large France » (centre sur
//      la France métropolitaine) — jamais un fetch par station (NFR-PERF-2) ;
//   2. enrichissement des stations (ticket 019) : noms réels / enseigne / logo
//      via OSM (provider osmMetadata, 018) puis repli dérivation adresse
//      (module pur 017), sinon nom par défaut = id — aucun nom inventé
//      (invariant CONTEXT.md) ;
//   3. upsert des `stations` et des `prices` (transaction unique : aucune
//      écriture partielle douteuse — ADR-0003) ;
//   4. append quotidien de `price_history` : un seul snapshot par
//      (station, carburant, jour), upserté — ADR-0004 / TRE-1 ;
//   5. purge 48 h : les prix dont `prix_maj` est antérieur à 48 h sont
//      neutralisés (rupture=true) : exclus des recommandations mais toujours
//      visibles avec badge (FRE-3, §9.6). La purge ne s'applique qu'aux
//      carburants réellement synchronisés ce tick : un carburant dont la
//      source a échoué n'est jamais modifié (tolérance à l'échec partiel).
//   6. marquage `synced_at` (stations + prices) et de la métadonnée
//      `last_sync` lue par /api/health (ticket 008).
//
// Tolérance à l'échec partiel : si un appel de provider échoue, on garde les
// données existantes de ce carburant et on retente au prochain tick (aucune
// écriture partielle douteuse — ADR-0003). Si tous les carburants échouent,
// rien n'est écrit et une erreur explicite est levée (jamais de prix inventé).
//
// Enrichissement 019 : best-effort et sans écriture destructrice. Si le
// provider OSM échoue (tolérance aux pannes : il retourne [] plutôt qu'une
// exception), on conserve la dérivation adresse puis le nom par défaut (id).
// L'upsert des colonnes d'enrichissement conserve la valeur PRÉCÉDENTE en base
// quand la résolution ne donne rien pour cette station (aucune écriture
// partielle : on ne remplace jamais un nom réel par null).
import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { FuelPriceProvider, StationMetadataProvider } from '../providers/types'
import { FUEL_TYPES, type FuelType, type StationPrice } from '../../domain/fuel-prices/types'
import { deriveBrandFromAddress } from '../../domain/stations/deriveBrand'
import { lastSync, prices } from '../db/schema'
import { createStationsRepository, type StationUpsertRow } from '../repositories/stations'
import { createPricesRepository, type PriceRow } from '../repositories/prices'
import { createPriceHistoryRepository, type PriceHistoryRow } from '../repositories/priceHistory'

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
  // Enrichissement d'identité (ticket 019) : provider OSM (018). Optionnel —
  // sans lui, les stations gardent leur nom/brand fournis par le provider de
  // prix (et le repli dérivation adresse n'est pas appliqué). Injecté par le
  // job périodique (schedule.ts) et le déclencheur manuel (sync.post.ts).
  metadataProvider?: StationMetadataProvider
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
  // Nombre de stations dont l'identité a été enrichie ce tick (OSM ou
  // dérivation adresse) — diagnostic, jamais un compteur de prix.
  enrichedStations: number
}

// Résout l'identité d'une station selon la chaîne de repli (ticket 019) :
//   1. OSM (métadonnées réelles : name, brand, brandWikidataId, logoUrl) ;
//   2. repli dérivation adresse (017) pour les stations non trouvées par OSM :
//      nom + enseigne d'une liste finie de marques réelles ;
//   3. sinon nom par défaut = id, brand = null (aucun nom fabriqué —
//      invariant CONTEXT.md).
// Retourne uniquement les champs d'identité à écrire : jamais de valeurs
// fabriquées. L'attribution OSM est portée par la constante exportée
// `OSM_METADATA_SOURCE_NAME` (types.ts), consommée par l'UI en 021.
export interface ResolvedIdentity {
  name: string
  brand: string | null
  brandWikidataId: string | null
  logoUrl: string | null
}

export async function resolveStationIdentities(
  byId: Map<string, StationPrice>,
  metadataProvider?: StationMetadataProvider
): Promise<Map<string, ResolvedIdentity>> {
  const identities = new Map<string, ResolvedIdentity>()

  // 1. OSM d'abord — requête groupée par id (NFR-PERF-2). Best-effort : un
  //    échec du provider (ou une source indisponible) → [] (jamais d'erreur).
  const ids = [...byId.keys()]
  if (metadataProvider && ids.length > 0) {
    try {
      const metas = await metadataProvider.findMetadataFor(ids)
      for (const meta of metas) {
        identities.set(meta.id, {
          name: meta.name ?? meta.id,
          brand: meta.brand,
          brandWikidataId: meta.brandWikidataId,
          logoUrl: meta.logoUrl
        })
      }
    } catch {
      // Provider OSM en échec : on garde la dérivation adresse / l'id.
    }
  }

  // 2. Repli dérivation adresse (017) pour les stations non trouvées par OSM.
  //    La dérivation est pure et ne fabrique jamais de nom : sans
  //    correspondance elle retourne null → nom par défaut = id.
  for (const s of byId.values()) {
    if (identities.has(s.id)) continue
    const derived = deriveBrandFromAddress(s.address, s.city)
    identities.set(s.id, derived
      ? { name: derived.name, brand: derived.brand, brandWikidataId: null, logoUrl: null }
      : { name: s.id, brand: null, brandWikidataId: null, logoUrl: null })
  }

  return identities
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
        skippedFuels: skipped.map((s) => s.fuel),
        enrichedStations: 0
      }
    }

    // 4. Enrichissement d'identité (ticket 019) : résolution OSM → adresse →
    //    id AVANT l'écriture, pour renseigner les colonnes dès l'upsert.
    const stationById = new Map<string, StationPrice>()
    for (const list of fetched.values()) {
      for (const s of list) {
        if (!stationById.has(s.id)) stationById.set(s.id, s)
      }
    }
    const identities = await resolveStationIdentities(stationById, options.metadataProvider)
    // 5. Écriture atomique : une seule transaction. better-sqlite3 exige un
    //    callback synchrone — on exécute les builders drizzle sans `await`.
    const snapshot = db.transaction((tx) => {
      return writeSnapshot(tx, fetched, identities, syncedAt, source)
    })

    return {
      stationsSynced: snapshot.stations,
      pricesSynced: snapshot.prices,
      historyAppended: snapshot.history,
      obsoleteNeutralized: snapshot.obsolete,
      source,
      syncedAt,
      skippedFuels: skipped.map((s) => s.fuel),
      enrichedStations: snapshot.enriched
    }
  }

  // Écrit l'ensemble (stations + prices + history + purge + last_sync) dans la
  // transaction `tx`. Toutes les opérations sont synchrones (driver
  // better-sqlite3) : si une seule échoue, la transaction est annulée et
  // aucune écriture partielle ne subsiste (tolérance à l'échec partiel).
  function writeSnapshot(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    byFuel: Map<FuelType, StationPrice[]>,
    identities: Map<string, ResolvedIdentity>,
    syncedAt: Date,
    source: string
  ): { stations: number; prices: number; history: number; obsolete: number; enriched: number } {
    const day = dayKey(today())
    let stationsSynced = 0
    let pricesSynced = 0
    let historyAppended = 0
    let obsolete = 0
    let enriched = 0

    // 5a. Upsert des stations (dédupliquées par id, tous carburants confondus),
    //     avec les colonnes d'enrichissement, en un seul INSERT multi-VALUES.
    //     Aucune écriture partielle : les champs d'identité non résolus ce tick
    //     (`undefined`) conservent la valeur précédente en base (on ne remplace
    //     jamais un nom réel par null). Si la station n'existe pas encore, le
    //     nom par défaut = id et brand = null (invariant CONTEXT.md).
    const stationsRepo = createStationsRepository(tx)
    const pricesRepo = createPricesRepository(tx)
    const historyRepo = createPriceHistoryRepository(tx)

    const stationById = new Map<string, StationPrice>()
    for (const list of byFuel.values()) {
      for (const s of list) {
        if (!stationById.has(s.id)) stationById.set(s.id, s)
      }
    }
    const stationRows: StationUpsertRow[] = []
    for (const s of stationById.values()) {
      const identity = identities.get(s.id) ?? {
        name: s.id,
        brand: null,
        brandWikidataId: null,
        logoUrl: null
      }
      // « Identité par défaut » : aucune résolution réelle ce tick (nom = id,
      // brand = null). Le repo en lot CONSERVE alors la valeur précédente en
      // base — on ne remplace jamais un nom/enseigne réels par null (aucune
      // écriture partielle, invariant CONTEXT.md). Un vrai enrichissement
      // (OSM ou dérivation adresse) écrase toujours les quatre colonnes.
      stationRows.push({
        id: s.id,
        name: identity.name,
        brand: identity.brand,
        brandWikidataId: identity.brandWikidataId,
        logoUrl: identity.logoUrl,
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
      // Compteur d'enrichissement réel : un nom autre que l'id ou une enseigne.
      if (identity.name !== s.id || identity.brand !== null) enriched++
    }
    stationsRepo.upsertMany(tx, stationRows)
    stationsSynced += stationRows.length

    // 5b. Upsert des prix + append quotidien de l'historique (ADR-0004), en
    //     un seul INSERT multi-VALUES par table.
    const priceRows: PriceRow[] = []
    const historyRows: PriceHistoryRow[] = []
    for (const [fuel, list] of byFuel) {
      for (const s of list) {
        priceRows.push({
          stationId: s.id,
          fuel,
          price: s.price,
          updatedAt: s.updatedAt,
          rupture: false,
          syncedAt
        })

        // Snapshot quotidien : un seul par (station, fuel, jour) — upsert.
        historyRows.push({
          stationId: s.id,
          fuel,
          day,
          price: s.price,
          syncedAt
        })
      }
    }
    pricesRepo.upsertMany(tx, priceRows)
    pricesSynced += priceRows.length
    historyRepo.upsertMany(tx, historyRows)
    historyAppended += historyRows.length

    // 5c. Purge 48 h : seulement pour les carburants réellement synchronisés
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

    // 5d. Métadonnée de synchronisation lue par /api/health. La source réelle
    //     (opendatasoft-api / opendatasoft-export / roulez-eco) permet d'afficher
    //     « données en cache (date) » côté cache (ADR-0003, recherche §13).
    tx.insert(lastSync)
      .values({ key: 'prices', syncedAt, source, updatedAt: syncedAt })
      .onConflictDoUpdate({
        target: lastSync.key,
        set: { syncedAt, source, updatedAt: syncedAt }
      })
      .run()

    return { stations: stationsSynced, prices: pricesSynced, history: historyAppended, obsolete, enriched }
  }
}
