// server/jobs/schedule.ts — Planification du job de synchronisation (ticket
// 008, spec §9.6). Un intervalle configurable (SYNC_INTERVAL_HOURS, défaut 2 —
// cohérent avec la fréquence observée de la source, recherche §5). Le tick ne
// bloque jamais le démarrage : il est différé d'une période, et un échec du
// tick est journalisé sans faire tomber le serveur (retentative au tick
// suivant). Retourne une fonction d'arrêt (clearInterval).
import type { Db } from '../db/client'
import type { FuelPriceProvider } from '../providers/types'
import { createSyncPricesJob } from './syncPrices'

export const DEFAULT_SYNC_INTERVAL_HOURS = 2
export const HOUR_MS = 3_600_000

export function parseSyncIntervalHours(value: string | undefined): number {
  if (!value) return DEFAULT_SYNC_INTERVAL_HOURS
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SYNC_INTERVAL_HOURS
  return parsed
}

export interface ScheduleSyncOptions {
  db: Db
  provider: FuelPriceProvider
  // Intervalle en heures (défaut : SYNC_INTERVAL_HOURS ?? 2).
  intervalHours?: number
  // Journalise les erreurs de tick (jamais de coordonnées).
  onError?: (error: unknown) => void
  onSync?: (result: unknown) => void
}

export function scheduleSyncPrices(options: ScheduleSyncOptions): () => void {
  const intervalHours = options.intervalHours ?? parseSyncIntervalHours(process.env.SYNC_INTERVAL_HOURS)
  // Les échecs par carburant sont internes au job (tolérance à l'échec
  // partiel) ; onError est appelé une seule fois par tick en échec global.
  const job = createSyncPricesJob({ db: options.db, provider: options.provider })

  // Premier tick différé : le démarrage n'est jamais bloqué par la synchro.
  const tick = async () => {
    try {
      const result = await job.run()
      options.onSync?.(result)
    } catch (error) {
      options.onError?.(error)
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, intervalHours * HOUR_MS)
  timer.unref?.()

  return () => clearInterval(timer)
}
