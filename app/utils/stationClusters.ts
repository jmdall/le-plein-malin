// utils/stationClusters.ts — Regroupement des marqueurs de carte qui se
// chevauchent (demande produit : « regrouper les stations, il y en a trop sur
// des petits périmètres » ; choix produit : clustering dynamique selon le
// zoom ; design ui-reference.md §5 « Clusters »). Module client pur, sans
// Leaflet : il décide, pour un rayon d'agrégation donné (dérivé du zoom par
// la carte), quels marqueurs sont regroupés (centroïde + nombre + attractivité
// du groupe) et lesquels restent individuels.
//
// Le cluster porte l'attractivité de sa station la plus « verte » (la moins
// chère) : le disque suit le dégradé du meilleur prix du groupe.
//
// La station de référence et la station recommandée sont des points d'ancrage
// de l'écran (la réponse) : elles ne sont JAMAIS regroupées — leur badge
// individuel reste visible, sinon un cluster s'ajouterait AU-DESSUS d'eux sans
// rien réduire à l'écran. Seules les autres stations (souvent des dizaines sur
// un petit périmètre) se regroupent entre elles.
import { haversineKm } from '../../domain/fuel-prices/haversine'
import type { StationMapMarker } from './stationMap'

// ——— Seuil d'agrégation dynamique selon le zoom ———
// Le zoom ne change pas la résolution de la carte, il change la distance au
// sol représentée par un pixel : à zoom n+1, tout est 2× plus grand à l'écran.
// Pour que les clusters regroupent exactement ce qui SE CHEVAUCHE à l'écran,
// le rayon de fusion doit être divisé par 2 à chaque zoom supplémentaire, et
// multiplié par 2 en dézoomant. Base : 2 km au zoom 11 (le zoom d'ouverture
// de la carte, MAP_START_ZOOM).
export const CLUSTER_BASE_RADIUS_KM = 2
export const CLUSTER_BASE_ZOOM = 11

export function clusterRadiusKmForZoom(zoom: number): number {
  return CLUSTER_BASE_RADIUS_KM * 2 ** (CLUSTER_BASE_ZOOM - zoom)
}

export interface StationCluster {
  markerIds: string[]
  lat: number
  lon: number
  /** Attractivité du cluster = celle de la station la PLUS attractive (la
      moins chère, la plus « verte ») du groupe. Le cluster porte le dégradé
      du meilleur prix : il dit « il y a mieux ici » avant même d'ouvrir.
      null si aucune station du groupe n'a d'attractivité. */
  attractiveness: number | null
}

export interface StationClusterView {
  /** Groupes de ≥ 2 marqueurs, avec leur centroïde. */
  clusters: StationCluster[]
  /** Ids des marqueurs à rendre individuellement : les marqueurs hors de
      tout cluster, PLUS les points d'ancrage (référence / recommandée),
      jamais regroupés. */
  individuals: string[]
}

export function buildStationClusters(
  markers: StationMapMarker[],
  mergeRadiusKm: number
): StationClusterView {
  const clusters: StationCluster[] = []

  for (const marker of markers) {
    // Les points d'ancrage (référence / recommandée) ne sont jamais
    // regroupés : leur badge individuel reste visible.
    if (marker.isReference || marker.isRecommended) {
      continue
    }
    let target: StationCluster | null = null
    let targetDistance = Infinity
    for (const cluster of clusters) {
      const distance = haversineKm(
        { lat: marker.lat, lon: marker.lon },
        { lat: cluster.lat, lon: cluster.lon }
      )
      if (distance <= mergeRadiusKm && distance < targetDistance) {
        target = cluster
        targetDistance = distance
      }
    }
    if (target) {
      target.markerIds.push(marker.id)
      const total = target.markerIds.length
      const lat = ((target.lat * (total - 1)) + marker.lat) / total
      const lon = ((target.lon * (total - 1)) + marker.lon) / total
      target.lat = lat
      target.lon = lon
      // Attractivité du cluster : le MAX des membres (la station la plus
      // « verte »). Une station sans attractivité (null) ne dégrade pas le
      // cluster : on ne garde que les valeurs connues.
      if (marker.attractiveness !== null) {
        target.attractiveness = Math.max(target.attractiveness ?? -Infinity, marker.attractiveness)
      }
    } else {
      clusters.push({
        markerIds: [marker.id],
        lat: marker.lat,
        lon: marker.lon,
        attractiveness: marker.attractiveness
      })
    }
  }

  const multi = clusters.filter((cluster) => cluster.markerIds.length > 1)
  const clusteredIds = new Set(multi.flatMap((cluster) => cluster.markerIds))
  const individuals = markers
    .filter((m) => m.isReference || m.isRecommended || !clusteredIds.has(m.id))
    .map((m) => m.id)

  return { clusters: multi, individuals }
}
