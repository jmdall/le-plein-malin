// server/lib/geocode.ts — Géocodage ville/CP (ticket 009, spec §4 parcours sans
// géolocalisation, §7.5-NFR-SEC-3). Service public Nominatim/OpenStreetMap en
// lecture seule (usage léger, sans clé) avec cache SQLite : une entrée par
// clé (ville normalisée ou code postal) mémorisée 24 h pour limiter les appels
// aux fournisseurs externes (NFR-SEC-3 : cache avec TTL).
//
// La position précise de l'utilisateur n'est ni persistée ni loggée (LOC-4,
// NFR-SEC-4) : seuls la ville/CP et le centroïde géocodé transitent par le
// cache ; jamais la localisation exacte (l'API n'utilise pas lat/lon ici).
import type { Db } from '../db/client'

// TTL du cache de géocodage : 24 h (NFR-SEC-3, « 1 h minimum »).
export const GEOCODE_CACHE_TTL_MS = 24 * 3_600_000

export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search'

export type FetchLike = typeof fetch

export interface GeocodeOptions {
  baseUrl?: string
  timeoutMs?: number
  fetchFn?: FetchLike
}

export interface GeocodeResult {
  label: string
  lat: number
  lon: number
}

// ——— Cache SQLite : table geocode_cache ———
// Le schéma vit ici (pas dans server/db/schema.ts) car ce cache est un
// détail d'implémentation du géocodage, indépendant du modèle métier §9.
// Il est créé au premier usage (la migration Drizzle reste inchangée).
export const GEOCODE_CACHE_SQL = `
  CREATE TABLE IF NOT EXISTS geocode_cache (
    key TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`

function parseCacheRow(row: { lat: number; lon: number; label: string; created_at: number }): GeocodeResult {
  return { label: row.label, lat: row.lat, lon: row.lon }
}

// Normalise la clé de cache : minuscules, sans accents, espaces réduits.
// La clé ne contient jamais de coordonnées.
export function geocodeCacheKey(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Cache : récupère l'entrée si elle existe et n'est pas expirée.
export function geocodeCacheGet(db: Db, key: string, now: Date): GeocodeResult | null {
  db.$client.exec(GEOCODE_CACHE_SQL)
  const row = db.$client
    .prepare('SELECT lat, lon, label, created_at FROM geocode_cache WHERE key = ?')
    .get(key) as
    | { lat: number; lon: number; label: string; created_at: number }
    | undefined

  if (!row) return null
  const ageMs = now.getTime() - row.created_at
  if (ageMs > GEOCODE_CACHE_TTL_MS) return null
  return parseCacheRow(row)
}

// Enregistre un résultat de géocodage dans le cache (upsert).
export function geocodeCacheSet(db: Db, key: string, result: GeocodeResult, now: Date): void {
  db.$client.exec(GEOCODE_CACHE_SQL)
  db.$client
    .prepare(
      `INSERT INTO geocode_cache (key, lat, lon, label, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET lat = excluded.lat, lon = excluded.lon,
         label = excluded.label, created_at = excluded.created_at`
    )
    .run(key, result.lat, result.lon, result.label, now.getTime())
}

// ——— Géocodeur Nominatim ———
// URL de recherche : « ?format=jsonv2&q=<ville ou CP>&countrycodes=fr&limit=1 ».
// Le résultat (si > 0) fournit un centroïde (lat/lon) et un nom affichable.
// La requête est construite pour ne PAS transmettre de lat/lon utilisateur.
export function buildNominatimUrl(q: string, baseUrl = NOMINATIM_BASE_URL): string {
  const url = new URL(baseUrl)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', q)
  url.searchParams.set('countrycodes', 'fr')
  url.searchParams.set('limit', '1')
  return url.toString()
}

// Crée le service de géocodage. fetchFn injectable pour les tests.
export function createGeocodeProvider(
  db: Db,
  options: GeocodeOptions = {}
): (input: string) => Promise<GeocodeResult> {
  const baseUrl = options.baseUrl ?? NOMINATIM_BASE_URL
  const timeoutMs = options.timeoutMs ?? 8_000
  const fetchFn = options.fetchFn ?? globalThis.fetch

  return async function geocode(input: string): Promise<GeocodeResult> {
    const key = geocodeCacheKey(input)

    // 1. Cache SQLite d'abord (limite les appels, NFR-SEC-3).
    const cached = geocodeCacheGet(db, key, new Date())
    if (cached) return cached

    // 2. Sinon appel Nominatim (lecture seule, sans clé).
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let result: GeocodeResult
    try {
      const res = await fetchFn(buildNominatimUrl(input, baseUrl), {
        signal: controller.signal
      })
      if (!res.ok) {
        throw new Error(`Géocodage Nominatim : HTTP ${res.status}`)
      }
      const json = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>
      if (!Array.isArray(json) || json.length === 0) {
        throw new Error('Géocodage Nominatim : aucune localisation trouvée')
      }
      const first = json[0] as { lat?: string; lon?: string; display_name?: string }
      const lat = Number(first.lat)
      const lon = Number(first.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Géocodage Nominatim : coordonnées invalides')
      }
      result = {
        label: (first.display_name ?? input).slice(0, 120),
        lat,
        lon
      }
    } finally {
      clearTimeout(timer)
    }

    // 3. Mise en cache (TTL 24 h) pour limiter les appels ultérieurs.
    geocodeCacheSet(db, key, result, new Date())
    return result
  }
}
