// server/providers/syncChain.ts — Chaîne de repli DÉDIÉE à la synchronisation
// complète (job + POST /api/sync). Différence avec la chaîne de l'API :
// l'export JSON complet est PRIORITAIRE, car l'API records paginée est
// plafonnée (30 pages × 100 = 3000 records max par carburant) — insuffisant
// pour couvrir la France entière (~73 493 records). L'export fait tout en un
// appel (~5 Mo gzip, 73k records, vérifié), filtre par haversine côté serveur.
// Ordre : export JSON complet → API records (repli si export KO) →
// roulez-eco.fr XML → cache SQLite (ADR-0003).
import type { Db } from '../db/client'
import { createFallbackChain, type FuelPriceProvider } from './index'
import { createJsonExportProvider } from './jsonExport'
import { createOpendatasoftProvider } from './opendatasoft'
import { createRoulezEcoProvider } from './roulezoeco'
import { createCacheProvider } from './cacheProvider'

export function createSyncProviderChain(db: Db): FuelPriceProvider {
  return createFallbackChain({
    providers: [
      createJsonExportProvider(),
      createOpendatasoftProvider(),
      createRoulezEcoProvider(),
      createCacheProvider(db)
    ],
    onError: (name, error) => {
      console.error(`[sync] provider ${name} indisponible :`, error)
    }
  })
}
