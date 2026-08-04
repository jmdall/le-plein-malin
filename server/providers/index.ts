// server/providers/index.ts — Chaîne de repli automatique (ADR-0003,
// recherche §13, spec §8). Ordre de priorité : Opendatasoft API → export JSON
// complet → roulez-eco.fr XML → cache SQLite. Chaque source produit des
// StationPrice[] normalisés. Échec total → erreur explicite, jamais un prix
// inventé.
import type { FuelPriceProvider, NearbyStationQuery, ProviderResult } from './types'

export type { FuelPriceProvider, NearbyStationQuery, ProviderResult, ProviderSource } from './types'
export type {
  StationMetadata,
  StationMetadataProvider
} from './types'
export { OSM_METADATA_SOURCE_NAME } from './types'
export { createOsmMetadataProvider, buildLogoUrl, parseOverpassResponse } from './osmMetadata'
export type { OsmMetadataOptions, FetchLike as OsmMetadataFetchLike } from './osmMetadata'
export { createOpendatasoftProvider, buildRecordsUrl, OPENDATASOFT_PAGE_SIZE } from './opendatasoft'
export type { OpendatasoftOptions, FetchLike as OpendatasoftFetchLike } from './opendatasoft'
export { createJsonExportProvider } from './jsonExport'
export type { JsonExportOptions, FetchLike as JsonExportFetchLike } from './jsonExport'
export { createRoulezEcoProvider, extractFirstXmlFromZip } from './roulezoeco'
export type { RoulezEcoOptions, FetchLike as RoulezEcoFetchLike } from './roulezoeco'
export { createCacheProvider, CACHE_TTL_MS, CACHE_MAX_AGE_WITHOUT_BADGE_MS } from './cacheProvider'
export type { CacheOptions } from './cacheProvider'
export {
  normalizeRecord,
  mapFuelName,
  toNumber,
  toDate,
  isPlausiblePrice,
  parseMetaJson
} from './normalize'

export interface FallbackChainOptions {
  providers: FuelPriceProvider[]
  // Log les échecs de chaque source pour le diagnostic (jamais de coordonnées).
  onError?: (providerName: string, error: unknown) => void
}

export function createFallbackChain(options: FallbackChainOptions): FuelPriceProvider {
  const { providers, onError } = options

  return {
    name: 'fallback-chain',

    async findNearbyStations(query: NearbyStationQuery): Promise<ProviderResult> {
      let lastError: unknown

      for (const provider of providers) {
        try {
          const result = await provider.findNearbyStations(query)
          return result
        } catch (error) {
          lastError = error
          onError?.(provider.name, error)
        }
      }

      const detail = lastError instanceof Error ? lastError.message : String(lastError)
      throw new Error(
        `Toutes les sources sont indisponibles (${providers.map((p) => p.name).join(', ')}) : ${detail}`
      )
    }
  }
}
