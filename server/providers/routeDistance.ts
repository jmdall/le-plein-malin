// server/providers/routeDistance.ts — Distances ROUTIÈRES centre → stations
// (ticket 033, ADR-0005). Remplace la ligne droite dans le coût du détour : une
// station à 3 km à vol d'oiseau est souvent à 4-5 km par la route, donc le coût
// du détour était sous-estimé et l'économie nette surestimée.
//
// OSRM public (router.project-osrm.org) : gratuit, sans clé (§11 — aucun
// service payant). Le service `/table` renvoie la matrice complète en UN appel :
// jamais N requêtes pour N stations. Cache SQLite par couple (origine,
// destination) : le réseau routier ne bouge pas, TTL 30 jours.
//
// Ce module ne décide RIEN du métier : il mesure. Le repli sur haversine et le
// choix de la mesure annoncée vivent dans server/lib/station-distances.ts.
import type { GeoPoint } from '../../domain/fuel-prices/types'
import type { Db } from '../db/client'

export const OSRM_BASE_URL = 'https://router.project-osrm.org'

// Le serveur public plafonne le nombre de coordonnées d'un /table (source
// incluse). On garde 99 destinations + 1 source = 100. Au-delà, les
// destinations en excès valent null → haversine, et le plafond est journalisé.
export const OSRM_MAX_DESTINATIONS = 99

export const OSRM_TIMEOUT_MS = 2_500

// TTL long : une route change à l'échelle des travaux, pas de la journée.
export const ROUTE_CACHE_TTL_MS = 30 * 24 * 3_600_000

// Précision de la clé de cache : 3 décimales ≈ 110 m. Assez fin pour ne pas
// mélanger deux quartiers, assez grossier pour que deux recherches voisines
// partagent le cache.
const CACHE_PRECISION = 3

// Seam (ADR-0005). Une seule méthode : la matrice depuis une origine.
// Retourne les km DANS L'ORDRE des destinations, `null` pour une destination
// sans route connue. Lève si l'appel entier échoue — l'appelant replie.
export interface RouteDistanceProvider {
  readonly name: string
  tableFromOrigin(origin: GeoPoint, destinations: GeoPoint[]): Promise<Array<number | null>>
}

export type FetchLike = typeof fetch

export interface OsrmOptions {
  baseUrl?: string
  timeoutMs?: number
  fetchFn?: FetchLike
}

// ——— URL du service /table ———
// OSRM attend les coordonnées en `lon,lat` (l'inverse de notre convention), la
// source en premier, et `annotations=distance` — sans quoi il renvoie des
// DURÉES et non des distances.
export function buildOsrmTableUrl(
  origin: GeoPoint,
  destinations: GeoPoint[],
  baseUrl = OSRM_BASE_URL
): string {
  const coords = [origin, ...destinations].map((p) => `${p.lon},${p.lat}`).join(';')
  const url = new URL(`${baseUrl}/table/v1/driving/${coords}`)
  url.searchParams.set('sources', '0')
  url.searchParams.set('annotations', 'distance')
  return url.toString()
}

// ——— Parsing de la réponse ———
// `{ code: 'Ok', distances: [[0, d1, d2, …]] }`, en MÈTRES. La première valeur
// est la distance de la source à elle-même (0) : on la saute. Une valeur non
// numérique (null OSRM ou type inattendu) devient `null` — jamais une distance
// inventée. Une réponse globalement inexploitable lève : l'appelant replie.
export function parseOsrmTable(json: unknown, expected: number): Array<number | null> {
  if (typeof json !== 'object' || json === null) {
    throw new Error('OSRM : réponse invalide')
  }
  const body = json as { code?: unknown; distances?: unknown }
  if (body.code !== 'Ok') {
    throw new Error(`OSRM : code ${String(body.code ?? 'absent')}`)
  }
  if (!Array.isArray(body.distances) || body.distances.length === 0) {
    throw new Error('OSRM : matrice de distances absente')
  }
  const row = body.distances[0]
  if (!Array.isArray(row)) {
    throw new Error('OSRM : ligne de distances invalide')
  }

  const out: Array<number | null> = []
  for (let i = 0; i < expected; i++) {
    // +1 : la colonne 0 est la source vers elle-même.
    const metres = row[i + 1]
    out.push(typeof metres === 'number' && Number.isFinite(metres) ? metres / 1000 : null)
  }
  return out
}

// ——— Cache SQLite ———
// Le schéma vit ici (pas dans server/db/schema.ts) : c'est un détail
// d'implémentation de la mesure, indépendant du modèle métier §9. Même parti
// que geocode_cache (server/lib/geocode.ts).
export const ROUTE_CACHE_SQL = `
  CREATE TABLE IF NOT EXISTS route_distance_cache (
    key TEXT PRIMARY KEY,
    distance_km REAL NOT NULL,
    created_at INTEGER NOT NULL
  )
`

function round(value: number): string {
  return value.toFixed(CACHE_PRECISION)
}

// Clé non symétrique : aller et retour peuvent différer (sens uniques).
export function routeCacheKey(origin: GeoPoint, destination: GeoPoint): string {
  return `${round(origin.lat)},${round(origin.lon)}|${round(destination.lat)},${round(destination.lon)}`
}

function cacheGet(db: Db, key: string, now: number): number | null {
  db.$client.exec(ROUTE_CACHE_SQL)
  const row = db.$client
    .prepare('SELECT distance_km, created_at FROM route_distance_cache WHERE key = ?')
    .get(key) as { distance_km: number; created_at: number } | undefined
  if (!row) return null
  if (now - row.created_at > ROUTE_CACHE_TTL_MS) return null
  return row.distance_km
}

function cacheSet(db: Db, key: string, distanceKm: number, now: number): void {
  db.$client.exec(ROUTE_CACHE_SQL)
  db.$client
    .prepare(
      `INSERT INTO route_distance_cache (key, distance_km, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET distance_km = excluded.distance_km,
         created_at = excluded.created_at`
    )
    .run(key, distanceKm, now)
}

// ——— Provider OSRM ———
export function createOsrmRouteProvider(db: Db, options: OsrmOptions = {}): RouteDistanceProvider {
  const baseUrl = options.baseUrl ?? process.env.OSRM_BASE_URL ?? OSRM_BASE_URL
  const timeoutMs = options.timeoutMs ?? parseTimeout(process.env.OSRM_TIMEOUT_MS)
  const fetchFn = options.fetchFn ?? globalThis.fetch

  return {
    name: 'osrm',
    async tableFromOrigin(origin, destinations) {
      if (destinations.length === 0) return []

      const now = Date.now()
      const result: Array<number | null> = new Array(destinations.length).fill(null)

      // 1. Cache d'abord : on ne demande à OSRM que ce qu'on ignore.
      const missingIndexes: number[] = []
      destinations.forEach((destination, index) => {
        const cached = cacheGet(db, routeCacheKey(origin, destination), now)
        if (cached !== null) {
          result[index] = cached
        } else {
          missingIndexes.push(index)
        }
      })
      if (missingIndexes.length === 0) return result

      // 2. Plafond de coordonnées du serveur : l'excès reste à null (→ haversine
      //    côté appelant). Jamais silencieux (« no silent caps »).
      const asked = missingIndexes.slice(0, OSRM_MAX_DESTINATIONS)
      if (missingIndexes.length > asked.length) {
        console.warn(
          `[routeDistance] ${missingIndexes.length} distances manquantes, plafond OSRM ${OSRM_MAX_DESTINATIONS} : ` +
            `${missingIndexes.length - asked.length} station(s) repliée(s) sur la ligne droite.`
        )
      }

      // 3. UN seul appel /table pour toutes les destinations manquantes.
      const url = buildOsrmTableUrl(
        origin,
        asked.map((i) => destinations[i]!),
        baseUrl
      )
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let parsed: Array<number | null>
      try {
        const response = await fetchFn(url, {
          signal: controller.signal,
          headers: { accept: 'application/json' }
        })
        if (!response.ok) {
          throw new Error(`OSRM : HTTP ${response.status}`)
        }
        parsed = parseOsrmTable(await response.json(), asked.length)
      } finally {
        clearTimeout(timer)
      }

      // 4. Report + mise en cache des distances effectivement obtenues.
      asked.forEach((destinationIndex, i) => {
        const km = parsed[i]
        if (km === null || km === undefined) return
        result[destinationIndex] = km
        cacheSet(db, routeCacheKey(origin, destinations[destinationIndex]!), km, now)
      })

      return result
    }
  }
}

function parseTimeout(raw: string | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : OSRM_TIMEOUT_MS
}

// ——— Fabrique lue depuis l'environnement ———
// `ROUTE_DISTANCE_PROVIDER=none` désactive complètement le routage : la mesure
// retombe sur haversine, comme avant le ticket 033.
export function createRouteDistanceProvider(db: Db): RouteDistanceProvider | undefined {
  const configured = (process.env.ROUTE_DISTANCE_PROVIDER ?? 'osrm').toLowerCase()
  if (configured === 'none') return undefined
  return createOsrmRouteProvider(db)
}
