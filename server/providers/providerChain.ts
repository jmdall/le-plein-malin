// server/providers/providerChain.ts — Chaîne de repli unique paramétrée par
// rayon (ticket 028, ADR-0003, recherche §13). L'ordre de repli des sources
// de prix ne vit plus dans les routes : `radiusKm` décide qui est prioritaire.
//   · rayon ≤ 100 km : l'API records paginée est rapide et précise → Opendatasoft
//     d'abord, puis export JSON, roulez-eco.fr, cache (repli).
//   · rayon > 100 km (France entière) : la pagination est plafonnée à
//     3000 records/carburant (30 pages × 100), insuffisante pour ~73 493 records
//     → l'export JSON complet (un seul appel, filtré par haversine côté serveur)
//     est prioritaire, puis API records, roulez-eco.fr, cache.
import type { Db } from '../db/client'
import {
  createCacheProvider,
  createFallbackChain,
  createJsonExportProvider,
  createOpendatasoftProvider,
  createRoulezEcoProvider,
  type FuelPriceProvider
} from './index'

// Identifiants internes de l'ordre de repli (source de vérité unique, testée).
export type ProviderChainSource = 'opendatasoft' | 'export' | 'roulezoeco' | 'cache'

// Rayon au-delà duquel on bascule de la chaîne records (paginée, plafonnée à
// 3000 records/carburant) vers la chaîne export JSON complet (France entière).
export const EXPORT_FIRST_RADIUS_KM = 100

// Règle documentée (ADR-0003, recherche §13) : rayon ≤ 100 → records d'abord,
// sinon (France entière) → export d'abord.
export function resolveProviderOrder(radiusKm: number): ProviderChainSource[] {
  return radiusKm <= EXPORT_FIRST_RADIUS_KM
    ? ['opendatasoft', 'export', 'roulezoeco', 'cache']
    : ['export', 'opendatasoft', 'roulezoeco', 'cache']
}

export interface ProviderChainOptions {
  // Injection de providers (tests) : si absents, les providers réels sont
  // construits dans l'ordre canonique (opendatasoft → export → roulez-eco →
  // cache), réordonnés ensuite selon le rayon.
  providers?: FuelPriceProvider[]
  logPrefix?: string
}

// Repertoire le provider correspondant à une source de l'ordre de repli, par
// son `name`. Accepte le nom réel (ex. 'opendatasoft-api') et le nom court
// des fakes de test (ex. 'opendatasoft').
function providerForSource(
  providers: FuelPriceProvider[],
  source: ProviderChainSource
): FuelPriceProvider | undefined {
  const name = source === 'opendatasoft' ? 'opendatasoft-api' : source === 'export' ? 'opendatasoft-export' : source
  return providers.find((p) => p.name === name) ?? providers.find((p) => p.name === source)
}

export function createProviderChain(
  db: Db,
  radiusKm = 10,
  options: ProviderChainOptions = {}
): FuelPriceProvider {
  const logPrefix = options.logPrefix ?? '[provider-chain]'
  const baseProviders = options.providers ?? [
    createOpendatasoftProvider(),
    createJsonExportProvider(),
    createRoulezEcoProvider(),
    createCacheProvider(db)
  ]

  const ordered = resolveProviderOrder(radiusKm)
    .map((source) => providerForSource(baseProviders, source))
    .filter((p): p is FuelPriceProvider => p !== undefined)

  return createFallbackChain({
    providers: ordered,
    onError: (name, error) => {
      console.error(`${logPrefix} provider ${name} indisponible :`, error)
    }
  })
}
