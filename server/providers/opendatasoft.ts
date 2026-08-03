// server/providers/opendatasoft.ts — Provider principal (ADR-0003, priorité 1).
// API Explore v2.1 : dataset `prix-carburants-quotidien` sur
// data.economie.gouv.fr. Filtrage spatial `within_distance`, pagination
// limit/offset (NFR-PERF-2 : jamais un fetch par station).
import type { StationPrice } from '../../domain/fuel-prices/types'
import { normalizeRecord } from './normalize'
import type {
  FuelPriceProvider,
  NearbyStationQuery,
  ProviderResult
} from './types'

const BASE_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants-quotidien/records'

export const OPENDATASOFT_PAGE_SIZE = 100
export const OPENDATASOFT_MAX_PAGES = 30
const REQUEST_TIMEOUT_MS = 15_000

// Record brut renvoyé par l'API (on ne sélectionne que les champs utiles).
interface OpendatasoftRecord {
  id: string | number
  adresse?: string
  ville?: string
  cp?: string
  geom?: { lon?: number; lat?: number } | null
  prix_nom?: string
  prix_valeur?: number | string
  prix_maj?: string
  rupture?: string | null
  fermeture?: string | null
}

interface RecordsResponse {
  total_count: number
  results: OpendatasoftRecord[]
}

export type FetchLike = typeof fetch

// Déduplique par (station, fuel) : l'API renvoie des doublons (un record par
// entrée de `rupture` d'autres carburants). On garde la première occurrence.
export function dedupeByStationFuel(records: StationPrice[]): StationPrice[] {
  const seen = new Set<string>()
  const out: StationPrice[] = []
  for (const r of records) {
    const key = `${r.id}:${r.fuel}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export function buildRecordsUrl(
  query: NearbyStationQuery,
  offset: number,
  baseUrl = BASE_URL
): URL {
  const url = new URL(baseUrl)
  const { lat, lon } = query.center
  // Syntaxe réelle vérifiée : within_distance(geom, geom'POINT(lon lat)', 10km).
  url.searchParams.set(
    'where',
    `within_distance(geom,geom'POINT(${lon} ${lat})',${query.radiusKm}km)`
  )
  url.searchParams.set('select', [
    'id',
    'adresse',
    'ville',
    'cp',
    'geom',
    'prix_nom',
    'prix_valeur',
    'prix_maj',
    'rupture',
    'fermeture'
  ].join(','))
  url.searchParams.set('limit', String(OPENDATASOFT_PAGE_SIZE))
  url.searchParams.set('offset', String(offset))
  return url
}

export interface OpendatasoftOptions {
  baseUrl?: string
  pageSize?: number
  maxPages?: number
  timeoutMs?: number
  fetchFn?: FetchLike
}

export function createOpendatasoftProvider(
  options: OpendatasoftOptions = {}
): FuelPriceProvider {
  const baseUrl = options.baseUrl ?? BASE_URL
  const pageSize = options.pageSize ?? OPENDATASOFT_PAGE_SIZE
  const maxPages = options.maxPages ?? OPENDATASOFT_MAX_PAGES
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const fetchFn = options.fetchFn ?? globalThis.fetch

  async function fetchPage(url: URL): Promise<RecordsResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchFn(url.toString(), { signal: controller.signal })
      if (!res.ok) {
        // 404 NotFoundResource = dataset supprimé/renommé (recherche §2).
        const body = await res.text().catch(() => '')
        throw new Error(
          `API Opendatasoft : HTTP ${res.status} (dataset supprimé/renommé ?) ${body.slice(0, 200)}`
        )
      }
      const json = (await res.json()) as Partial<RecordsResponse>
      if (!Array.isArray(json.results)) {
        throw new Error('API Opendatasoft : réponse sans liste results')
      }
      return { total_count: json.total_count ?? 0, results: json.results }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    name: 'opendatasoft-api',

    async findNearbyStations(query: NearbyStationQuery): Promise<ProviderResult> {
      const collected: StationPrice[] = []
      let offset = 0

      // Pagination limit/offset (NFR-PERF-2), bornée pour éviter une boucle.
      for (let page = 0; page < maxPages; page++) {
        const url = buildRecordsUrl(query, offset, baseUrl)
        url.searchParams.set('limit', String(pageSize))

        const response = await fetchPage(url)
        const totalCount = response.total_count

        for (const raw of response.results) {
          const normalized = normalizeRecord(raw, query.fuel)
          if (normalized) collected.push(normalized)
        }

        offset += response.results.length
        if (offset >= totalCount || response.results.length === 0) break
      }

      // Note : si la boucle est bornée par maxPages avant la fin (total_count
      // supérieur), les données retournées restent réelles — jamais inventées.
      return {
        stations: dedupeByStationFuel(collected),
        source: 'opendatasoft-api',
        syncedAt: new Date()
      }
    }
  }
}
