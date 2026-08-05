// server/providers/osmMetadata.ts — Provider de MÉTADONNÉES d'identité
// (ticket 018) : nom réel, enseigne, logo des stations, source OpenStreetMap.
// Les stations DGCCFR portent `ref:FR:prix-carburants` = leur id officiel
// (vérifié réel : 1000001 → « Carrefour Market », 1000012 → « Total » avec
// brand:wikidata Q154037) → matching 1:1 par id. Interroge Overpass sur une
// requête GROUPÉE (ids en valeurs, jamais un fetch par station — NFR-PERF-2),
// puis résout le logo best-effort via `brand:wikidata` (Wikidata P154 → URL
// stable upload.wikimedia.org). Aucun prix n'est touché. Tolérance aux pannes :
// source indisponible → [] , jamais d'exception (l'appelant 019 fait le repli).
// Source : © OpenStreetMap, licence ODbL — attribution via `sourceName`.
import { createHash } from 'node:crypto'
import type { StationMetadata, StationMetadataProvider } from './types'
import { OSM_METADATA_SOURCE_NAME } from './types'

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter'
const WIKIDATA_ENTITY_URL = 'https://www.wikidata.org/wiki/Special:EntityData'
const WIKIMEDIA_UPLOAD_URL = 'https://upload.wikimedia.org/wikipedia/commons'
const REQUEST_TIMEOUT_MS = 20_000
const LOGO_FETCH_TIMEOUT_MS = 10_000
// Overpass exige un User-Agent explicite (les requêtes sans UA sont rejetées
// en 406) : on l'identifie, jamais un client générique (politique Overpass).
export const OVERPASS_USER_AGENT = 'je-fais-le-plein-ou-non/1.0 (recherche prix carburants)'
// Taille de lot Overpass : la requête groupée est bornée (URL + temps serveur).
// Un lot de 2000 ids ≈ 7-10 s sur overpass-api.de (vérifié). On ne dépasse
// jamais un fetch par station (NFR-PERF-2) : un fetch par lot au pire.
export const OVERPASS_QUERY_BATCH_SIZE = 2000
// Concurrence max des résolutions de logo Wikidata : au-delà, Wikidata
// limite (429) et tous les logos échouent (vérifié : 5700 fetch simultanés
// → 0 logo). Un pool borné préserve le best-effort sans saturer la source.
export const LOGO_FETCH_CONCURRENCY = 8

export type FetchLike = typeof fetch

export interface OsmMetadataOptions {
  overpassUrl?: string
  timeoutMs?: number
  logoTimeoutMs?: number
  // Taille de lot Overpass (défaut OVERPASS_QUERY_BATCH_SIZE) — injectable pour
  // les tests.
  batchSize?: number
  // Concurrence max des résolutions de logo (défaut LOGO_FETCH_CONCURRENCY).
  logoConcurrency?: number
  // Nombre de tentatives d'un lot Overpass (défaut 3). Overpass est
  // intermittent (504/429) : on retente avant de se rabattre sur le repli 017.
  retries?: number
  // Délai entre tentatives en ms (défaut 800) — évite de marteler une source
  // chargée.
  retryDelayMs?: number
  fetchFn?: FetchLike
}

// Construit l'URL stable upload.wikimedia.org d'un fichier Commons. Le chemin
// (hachage) est le préfixe md5 du nom de fichier, espaces → underscores
// (mécanisme officiel Wikimedia). DÉTERMINISTE et sans second appel réseau :
// il suffit du nom de fichier (P154). Vérifié réel : « Esso textlogo.svg » →
// commons/2/22/Esso_textlogo.svg, « Total wordmark (2003-2021).svg » →
// commons/e/ed/…svg.
export function buildLogoUrl(commonsFilename: string): string | null {
  if (!commonsFilename || !commonsFilename.trim()) return null
  const filename = commonsFilename.replace(/\s+/g, '_').trim()
  // Nom de fichier plausible : pas de préfixe « File: », pas de chemins/slashes.
  if (!/^[^/:][\p{L}\p{N}._,\-()&'+!% ]+\.[A-Za-z0-9]+$/u.test(filename)) return null
  const hash = createHash('md5').update(filename).digest('hex')
  return `${WIKIMEDIA_UPLOAD_URL}/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(filename)}`
}

// ——— Parsing de la réponse Overpass ———

interface OverpassResponse {
  elements?: Array<{
    type?: string
    id?: number
    tags?: Record<string, string | undefined>
  }>
}

// Extrait (id, name, brand, brandWikidataId) par élément, en ignorant les
// éléments sans id. Déduplique par id : le premier élément gagne.
export function parseOverpassResponse(
  response: OverpassResponse
): StationMetadata[] {
  const seen = new Set<string>()
  const out: StationMetadata[] = []
  for (const element of response.elements ?? []) {
    if (element.type !== 'node') continue
    const tags = element.tags ?? {}
    const id = tags['ref:FR:prix-carburants']
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name: tags.name ?? null,
      brand: tags.brand ?? null,
      brandWikidataId: tags['brand:wikidata'] ?? null,
      logoUrl: null
    })
  }
  return out
}

export function createOsmMetadataProvider(
  options: OsmMetadataOptions = {}
): StationMetadataProvider {
  const overpassUrl = options.overpassUrl ?? OVERPASS_API_URL
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const logoTimeoutMs = options.logoTimeoutMs ?? LOGO_FETCH_TIMEOUT_MS
  const batchSize = options.batchSize ?? OVERPASS_QUERY_BATCH_SIZE
  const logoConcurrency = options.logoConcurrency ?? LOGO_FETCH_CONCURRENCY
  const retries = options.retries ?? 3
  const retryDelayMs = options.retryDelayMs ?? 800
  const fetchFn = options.fetchFn ?? globalThis.fetch

  // Résout le logo d'un brand:wikidata (P154) — best-effort, jamais bloquant.
  async function resolveLogo(
    brandWikidataId: string | null
  ): Promise<string | null> {
    if (!brandWikidataId) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), logoTimeoutMs)
    try {
      const res = await fetchFn(
        `${WIKIDATA_ENTITY_URL}/${encodeURIComponent(brandWikidataId)}.json`,
        { signal: controller.signal }
      )
      if (!res.ok) return null
      const json = (await res.json()) as {
        entities?: Record<string, { claims?: Record<string, unknown> }>
      }
      const entity = json.entities?.[brandWikidataId]
      const claim = entity?.claims?.P154 as
        | Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
        | undefined
      const raw = claim?.[0]?.mainsnak?.datavalue?.value
      if (typeof raw !== 'string') return null
      return buildLogoUrl(raw)
    } catch {
      // Wikidata indisponible / time out / JSON invalide : pas de logo.
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    name: 'osm-metadata',
    sourceName: OSM_METADATA_SOURCE_NAME,

    async findMetadataFor(stationIds: string[]): Promise<StationMetadata[]> {
      const ids = dedupe(stationIds)
      if (ids.length === 0) return []

      // Requêtes groupées par lot (NFR-PERF-2 : jamais un fetch par station).
      // La liste des ids en valeurs, bornée par lot : un fetch par lot au pire.
      const batches: string[][] = []
      for (let i = 0; i < ids.length; i += batchSize) {
        batches.push(ids.slice(i, i + batchSize))
      }

      const results: StationMetadata[][] = []
      for (const batch of batches) {
        // Requête Overpass groupée. `out tags` ne retourne que les tags
        // (léger), sans bbox — la recherche est globale, matching 1:1 par id.
        const query =
          `[out:json][timeout:20];node["amenity"="fuel"]` +
          `["ref:FR:prix-carburants"~"^(${batch.join('|')})$"];out tags;`

        // Overpass est intermittent (504/429) : on retente avant de rendre un
        // lot vide. Jamais un fetch par station (NFR-PERF-2) — retentative du
        // lot groupé, pas de nouveaux appels unitaires.
        let elements: StationMetadata[] = []
        for (let attempt = 0; attempt < retries; attempt++) {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), timeoutMs)
          try {
            const res = await fetchFn(overpassUrl, {
              method: 'POST',
              body: `data=${encodeURIComponent(query)}`,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // User-Agent obligatoire (politique Overpass) : sans lui, HTTP
                // 406 et la résolution silencieusement échoue (ticket 019).
                'User-Agent': OVERPASS_USER_AGENT
              },
              signal: controller.signal
            })
            if (!res.ok) {
              // 504/429/406 : transitoire, on retente (puis [] en dernier recours).
              if (attempt < retries - 1) await sleep(retryDelayMs)
              continue
            }
            const json = (await res.json()) as OverpassResponse
            elements = parseOverpassResponse(json)
            break
          } catch {
            // Overpass indisponible / timeout / JSON invalide : retentative,
            // puis [] (repli 017).
            if (attempt < retries - 1) await sleep(retryDelayMs)
            continue
          } finally {
            clearTimeout(timer)
          }
        }

        results.push(elements)
      }

      const flattened = results.flat()

      // Logo best-effort : jamais bloquant (Wikidata indisponible → null).
      // Pool borné (LOGO_FETCH_CONCURRENCY) : éviter de marteler Wikidata —
      // 5700 fetch simultanés → 429 massifs et 0 logo (vérifié). On déduplique
      // par brand:wikidata (des dizaines de milliers de stations partagent
      // ~40 enseignes) : un fetch Wikidata par enseigne, jamais par station.
      const logoCache = new Map<string, string | null>()
      const resolved: StationMetadata[] = new Array(flattened.length)
      let cursor = 0
      async function worker() {
        while (true) {
          const index = cursor++
          if (index >= flattened.length) return
          const meta = flattened[index]!
          let logoUrl: string | null
          if (meta.brandWikidataId) {
            if (!logoCache.has(meta.brandWikidataId)) {
              logoCache.set(meta.brandWikidataId, await resolveLogo(meta.brandWikidataId))
            }
            logoUrl = logoCache.get(meta.brandWikidataId) ?? null
          } else {
            logoUrl = null
          }
          resolved[index] = { ...meta, logoUrl }
        }
      }
      const workers = Array.from(
        { length: Math.min(logoConcurrency, Math.max(1, flattened.length)) },
        () => worker()
      )
      await Promise.all(workers)
      return resolved
    }
  }
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
