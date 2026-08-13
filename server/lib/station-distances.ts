// server/lib/station-distances.ts — Seam UNIQUE de résolution des distances
// centre → stations (ticket 033, ADR-0005).
//
// Avant ce ticket, quatre sites recodaient `haversineKm(center, s.position)`
// (les trois builders de api-response-builder + recommendation-input). Ils
// passent tous par ici, ce qui donne un seul endroit où la mesure change.
//
// Règles :
//   - distance routière quand on l'a (plus juste : le coût du détour était
//     sous-estimé par la ligne droite) ;
//   - haversine dès qu'elle manque — une recherche ne doit JAMAIS échouer
//     parce qu'un service de routage est indisponible ;
//   - `source: 'road'` seulement si TOUTES les stations ont une distance
//     routière. Partiel ⇒ `'straight-line'` : l'app n'annonce pas une mesure
//     qu'elle ne tient pas pour toutes les candidates, même si les kilomètres
//     routiers disponibles sont bien utilisés.
//
// Le rayon de recherche reste haversine (filtré en amont par le provider) : on
// ne re-filtre pas sur la distance routière — un rayon est une zone, pas un
// budget de trajet (ADR-0005, « Conséquences »).
import { haversineKm } from '../../domain/fuel-prices/haversine'
import type { GeoPoint, StationPrice } from '../../domain/fuel-prices/types'
import type { RouteDistanceProvider } from '../providers/routeDistance'
import type { StationWithDistance } from './station-mapping'

// Quelle mesure a réellement servi. Transmis au module pur (`detourSource`)
// pour que l'hypothèse affichée dise la vérité.
export type DistanceSource = 'road' | 'straight-line'

export interface ResolvedStationDistances {
  withDistance: StationWithDistance[]
  source: DistanceSource
}

function isUsableKm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export async function resolveStationDistances(options: {
  center: GeoPoint
  stations: StationPrice[]
  route?: RouteDistanceProvider
}): Promise<ResolvedStationDistances> {
  const { center, stations, route } = options
  if (stations.length === 0) {
    return { withDistance: [], source: 'straight-line' }
  }

  let roadKm: Array<number | null> | null = null
  if (route) {
    try {
      const measured = await route.tableFromOrigin(
        center,
        stations.map((s) => s.position)
      )
      // Un provider qui répond une longueur incohérente est ignoré en entier :
      // on ne devine pas à quelle station appartient quelle distance.
      roadKm = measured.length === stations.length ? measured : null
      if (roadKm === null) {
        console.warn(
          `[station-distances] ${route.name} a renvoyé ${measured.length} distances pour ` +
            `${stations.length} stations : repli sur la ligne droite.`
        )
      }
    } catch (error) {
      // Indisponibilité, timeout, réponse invalide : la recherche continue.
      console.error(`[station-distances] ${route.name} indisponible, repli ligne droite :`, error)
      roadKm = null
    }
  }

  let allRouted = roadKm !== null
  const withDistance = stations.map((s, index) => {
    const measured = roadKm?.[index]
    if (isUsableKm(measured)) {
      return { ...s, distanceKm: measured }
    }
    allRouted = false
    return { ...s, distanceKm: haversineKm(center, s.position) }
  })

  return { withDistance, source: allRouted ? 'road' : 'straight-line' }
}
