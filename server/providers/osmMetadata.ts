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

export type FetchLike = typeof fetch

export interface OsmMetadataOptions {
  overpassUrl?: string
  timeoutMs?: number
  logoTimeoutMs?: number
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

      // Requête groupée Overpass : les ids en valeurs (NFR-PERF-2, un seul
      // appel). `out tags` ne retourne que les tags (léger), sans bbox — la
      // recherche est globale, le matching est 1:1 par id.
      const query =
        `[out:json][timeout:20];node["amenity"="fuel"]` +
        `["ref:FR:prix-carburants"~"^(${ids.join('|')})$"];out tags;`

      let elements: StationMetadata[]
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchFn(overpassUrl, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: controller.signal
        })
        if (!res.ok) return []
        const json = (await res.json()) as OverpassResponse
        elements = parseOverpassResponse(json)
      } catch {
        // Overpass indisponible / timeout / JSON invalide : [] (repli 017).
        return []
      } finally {
        clearTimeout(timer)
      }

      const resolved = await Promise.all(
        elements.map(async (meta) => ({
          ...meta,
          logoUrl: await resolveLogo(meta.brandWikidataId)
        }))
      )
      return resolved
    }
  }
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)]
}
