// server/plugins/schedule.ts — Plugin Nitro : planifie le job de synchronisation
// (ticket 008, spec §9.6). Ne bloque jamais le démarrage : le premier tick est
// différé d'une période et un échec de tick est journalisé sans faire tomber
// le serveur (retentative au tick suivant). L'intervalle est configurable via
// SYNC_INTERVAL_HOURS (défaut 2).
import { defineNitroPlugin } from 'nitropack/runtime'
import { createDb } from '../db/client'
import { createSyncProviderChain } from '../providers/syncChain'
import { createOsmMetadataProvider } from '../providers/osmMetadata'
import { scheduleSyncPrices } from '../jobs/schedule'

export default defineNitroPlugin((nitroApp) => {
  // Connexion SQLite + migration (déjà exécutée par client.ts au premier accès ;
  // ici on prépare la connexion partagée du job).
  const { db } = createDb()

  // Chaîne de repli DÉDIÉE sync (export JSON complet prioritaire) : l'API
  // records paginée est plafonnée à 3000 records/carburant, insuffisante pour
  // la France entière (server/providers/syncChain.ts).
  const provider = createSyncProviderChain(db)

  // Enrichissement d'identité (ticket 019) : le job périodique applique OSM →
  // dérivation adresse → nom par défaut à chaque station synchronisée.
  const metadataProvider = createOsmMetadataProvider()

  const stop = scheduleSyncPrices({
    db,
    provider,
    metadataProvider,
    onError: (error) => {
      nitroApp.captureError(error instanceof Error ? error : new Error(String(error)), {
        tags: ['sync']
      })
    }
  })

  nitroApp.hooks.hook('close', () => stop())
})
