// server/plugins/schedule.ts — Plugin Nitro : planifie le job de synchronisation
// (ticket 008, spec §9.6). Ne bloque jamais le démarrage : le premier tick est
// différé d'une période et un échec de tick est journalisé sans faire tomber
// le serveur (retentative au tick suivant). L'intervalle est configurable via
// SYNC_INTERVAL_HOURS (défaut 2).
import { defineNitroPlugin } from 'nitropack/runtime'
import { createDb } from '../db/client'
import {
  createOpendatasoftProvider,
  createJsonExportProvider,
  createRoulezEcoProvider,
  createCacheProvider,
  createFallbackChain
} from '../providers'
import { scheduleSyncPrices } from '../jobs/schedule'

export default defineNitroPlugin((nitroApp) => {
  // Connexion SQLite + migration (déjà exécutée par client.ts au premier accès ;
  // ici on prépare la connexion partagée du job).
  const { db } = createDb()

  // Chaîne de repli (ADR-0003) : Opendatasoft → export JSON → roulez-eco → cache.
  const provider = createFallbackChain({
    providers: [
      createOpendatasoftProvider(),
      createJsonExportProvider(),
      createRoulezEcoProvider(),
      createCacheProvider(db)
    ],
    onError: (name, error) => {
      nitroApp.captureError(error instanceof Error ? error : new Error(String(error)), {
        tags: ['sync', name]
      })
    }
  })

  const stop = scheduleSyncPrices({
    db,
    provider,
    onError: (error) => {
      nitroApp.captureError(error instanceof Error ? error : new Error(String(error)), {
        tags: ['sync']
      })
    }
  })

  nitroApp.hooks.hook('close', () => stop())
})
