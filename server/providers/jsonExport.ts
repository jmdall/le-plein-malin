// server/providers/jsonExport.ts — Repli priorité 2 (ADR-0003) : export JSON
// complet du dataset (…/exports/json), un seul appel (NFR-PERF-2). Le dataset
// ne fournissant que l'état courant, l'export n'est pas paginable de façon
// spatiale : on télécharge le JSON complet (~73k records) et on le filtre en
// mémoire avec la haversine pure du domaine.
import { haversineKm } from '../../domain/fuel-prices/haversine'
import type { StationPrice } from '../../domain/fuel-prices/types'
import { normalizeRecord } from './normalize'
import type {
  FuelPriceProvider,
  NearbyStationQuery,
  ProviderResult
} from './types'

const EXPORT_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants-quotidien/exports/json'

const REQUEST_TIMEOUT_MS = 60_000

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

export type FetchLike = typeof fetch

export interface JsonExportOptions {
  exportUrl?: string
  timeoutMs?: number
  fetchFn?: FetchLike
}

export function createJsonExportProvider(
  options: JsonExportOptions = {}
): FuelPriceProvider {
  const exportUrl = options.exportUrl ?? EXPORT_URL
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const fetchFn = options.fetchFn ?? globalThis.fetch

  return {
    name: 'opendatasoft-export',

    async findNearbyStations(query: NearbyStationQuery): Promise<ProviderResult> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let records: OpendatasoftRecord[]
      try {
        const res = await fetchFn(exportUrl, { signal: controller.signal })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(
            `Export JSON complet : HTTP ${res.status} (dataset supprimé/renommé ?) ${body.slice(0, 200)}`
          )
        }
        const json = (await res.json()) as unknown
        if (!Array.isArray(json)) {
          throw new Error('Export JSON complet : réponse non array')
        }
        records = json as OpendatasoftRecord[]
      } finally {
        clearTimeout(timer)
      }

      const { lat, lon } = query.center
      const radiusKm = query.radiusKm
      const collected: StationPrice[] = []

      for (const raw of records) {
        const normalized = normalizeRecord(raw, query.fuel)
        if (!normalized) continue
        // Filtrage spatial local : haversine pure du domaine.
        if (haversineKm({ lat, lon }, normalized.position) <= radiusKm) {
          collected.push(normalized)
        }
      }

      return {
        stations: collected,
        source: 'opendatasoft-export',
        syncedAt: new Date()
      }
    }
  }
}
