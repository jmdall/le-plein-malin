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

// ——— Seuil d'agrégation : exprimé en PIXELS (ticket 040) ———
// L'objectif est de regrouper ce qui SE CHEVAUCHE À L'ÉCRAN. La grandeur qui
// décide est donc une largeur en pixels, pas une distance au sol.
//
// L'ancienne formule partait de « 2 km au zoom 11 » et halvait par zoom.
// Arithmétiquement, cela donnait un rayon de fusion de **38 px à tous les
// zooms** — alors qu'un disque de cluster fait déjà 44 px et un badge prix avec
// logo ~80-90 px. Deux marqueurs à 38 px étaient donc déclarés « sans
// chevauchement » pendant que leurs badges se recouvraient de moitié. Mesuré sur
// les 9 483 stations Gazole de la base, viewport 1280×800 centré Paris : 198
// objets à l'écran au zoom 11, contre 49 avec la calibration correcte.
//
// Exprimer le seuil en pixels rend l'intention lisible, vérifiable contre le CSS,
// et supprime le couplage caché au zoom d'ouverture (MAP_START_ZOOM).

// Largeur d'un badge prix avec pastille d'enseigne, mesurée sur le CSS de
// StationMap.vue (font 0,78rem, ~5 caractères, pastille, padding 0,6rem × 2).
export const PRICE_BADGE_WIDTH_PX = 90

// Seuil retenu : la largeur d'un badge, plus une petite marge de respiration.
// Plus grand regrouperait des badges qui ne se chevauchent pas vraiment et
// forcerait à zoomer pour rien.
export const CLUSTER_MERGE_PIXELS = 100

// Latitude de référence par défaut : centre de la France métropolitaine. Un
// degré de longitude — donc l'échelle Web Mercator — dépend de la latitude ;
// l'appelant passe celle du centre de la carte quand il la connaît.
export const CLUSTER_REFERENCE_LATITUDE = 46.5

// Résolution Web Mercator pour des tuiles de 256 px.
const EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0 = 156543.03392

export function metresPerPixel(zoom: number, latitude: number): number {
  return (
    (EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
  )
}

export function clusterRadiusKmForZoom(
  zoom: number,
  latitude: number = CLUSTER_REFERENCE_LATITUDE
): number {
  return (CLUSTER_MERGE_PIXELS * metresPerPixel(zoom, latitude)) / 1000
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
  /** Prix le plus bas du groupe, parmi les stations FRAÎCHES uniquement
      (ticket 034). Le MINIMUM et non la moyenne : le disque porte déjà le
      dégradé de sa station la moins chère, donc une moyenne ferait dire deux
      choses au même disque — et c'est le meilleur prix qui déclenche un détour.
      Les prix > 24 h sont exclus : « dès X € » ne doit jamais reposer sur une
      donnée périmée (CONTEXT.md §Fraîcheur). null si aucun prix frais. */
  minPrice: number | null
}

export interface StationClusterView {
  /** Groupes de ≥ 2 marqueurs, avec leur centroïde. */
  clusters: StationCluster[]
  /** Ids des marqueurs à rendre individuellement : les marqueurs hors de
      tout cluster, PLUS les points d'ancrage (référence / recommandée),
      jamais regroupés. */
  individuals: string[]
}

// Prix utilisable pour le libellé « dès X € » : frais (≤ 24 h) et fini.
// Un prix périmé ou aberrant ne devient jamais la promesse du cluster.
function freshPrice(marker: StationMapMarker): number | null {
  if (marker.isStale) return null
  return Number.isFinite(marker.price) ? marker.price : null
}

// ——— Indexation spatiale (ticket 036) ———
// Comparer chaque marqueur à TOUS les clusters formés était O(n·k) : 4,3 s pour
// les 9 500 stations Gazole de la base au zoom 10, donc l'exploration libre de
// la carte était impossible, pas seulement lente.
//
// On indexe donc les clusters dans une grille de côté `mergeRadiusKm`. Avec une
// cellule de ce côté, tout cluster à une distance ≤ R d'un marqueur se trouve
// forcément dans l'une des 9 cellules voisines (3×3) : n'examiner que celles-là
// est EXACT, pas approché. Le résultat est identique à l'ancienne boucle — seul
// le nombre de candidats change.
//
// La décision reste prise à la distance haversine : la grille ne sert qu'à
// réduire les candidats, jamais à décider qui fusionne.
const KM_PER_DEG_LAT = 111.19

// Largeur d'une cellule en longitude : un degré de longitude vaut
// `111,19 × cos(lat)` km, donc une cellule d'un pas fixe en degrés est de plus
// en plus ÉTROITE en km à mesure qu'on monte vers le nord.
//
// La garantie des 9 voisines n'est vraie que si chaque cellule mesure AU MOINS
// R km de large : sinon un cluster à moins de R km peut se trouver à DEUX
// cellules de distance et échapper à la fenêtre 3×3. Mesuré : avec un cos fixe
// pris au centre de la France (46,5°), 9 500 marqueurs au zoom 8 donnaient
// 1 824 clusters au lieu des 1 823 de l'implémentation naïve.
//
// On dimensionne donc le pas sur la latitude la PLUS HAUTE du jeu (le cos le
// plus petit, donc la cellule la plus étroite). Les cellules du sud sont alors
// un peu plus larges que nécessaire : quelques candidats de plus à examiner,
// aucune perte d'exactitude.
const MIN_COS_LATITUDE = 0.05 // garde-fou : évite une division par ~0 près des pôles

function lonStepDegrees(mergeRadiusKm: number, markers: StationMapMarker[]): number {
  let maxAbsLat = 0
  for (const marker of markers) {
    const absLat = Math.abs(marker.lat)
    if (Number.isFinite(absLat) && absLat > maxAbsLat) maxAbsLat = absLat
  }
  const cos = Math.max(MIN_COS_LATITUDE, Math.cos((maxAbsLat * Math.PI) / 180))
  return mergeRadiusKm / (KM_PER_DEG_LAT * cos)
}

// Cluster en cours de construction : `seq` est l'ordre de création, qui départage
// les distances exactement à égalité. Sans lui, l'ordre de parcours des cellules
// pourrait faire gagner un autre cluster que l'ancienne boucle (qui gardait le
// premier créé) — le résultat ne serait plus strictement identique.
interface PendingCluster extends StationCluster {
  seq: number
}

export function buildStationClusters(
  markers: StationMapMarker[],
  mergeRadiusKm: number
): StationClusterView {
  const clusters: PendingCluster[] = []

  // Grille : clé « i,j » → clusters dont le centroïde tombe dans cette cellule.
  const grid = new Map<string, PendingCluster[]>()
  const latStep = mergeRadiusKm / KM_PER_DEG_LAT
  const lonStep = lonStepDegrees(mergeRadiusKm, markers)

  const cellKey = (lat: number, lon: number): string =>
    `${Math.floor(lat / latStep)},${Math.floor(lon / lonStep)}`

  function indexCluster(cluster: PendingCluster, key: string): void {
    const bucket = grid.get(key)
    if (bucket) bucket.push(cluster)
    else grid.set(key, [cluster])
  }

  function unindexCluster(cluster: PendingCluster, key: string): void {
    const bucket = grid.get(key)
    if (!bucket) return
    const at = bucket.indexOf(cluster)
    if (at >= 0) bucket.splice(at, 1)
  }

  for (const marker of markers) {
    // Les points d'ancrage (référence / recommandée) ne sont jamais
    // regroupés : leur badge individuel reste visible.
    if (marker.isReference || marker.isRecommended) {
      continue
    }

    // Candidats : les 9 cellules autour du marqueur, jamais toute la liste.
    const baseI = Math.floor(marker.lat / latStep)
    const baseJ = Math.floor(marker.lon / lonStep)
    let target: PendingCluster | null = null
    let targetDistance = Infinity
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const bucket = grid.get(`${baseI + di},${baseJ + dj}`)
        if (!bucket) continue
        for (const cluster of bucket) {
          const distance = haversineKm(
            { lat: marker.lat, lon: marker.lon },
            { lat: cluster.lat, lon: cluster.lon }
          )
          if (distance > mergeRadiusKm) continue
          // `<` puis départage par ordre de création : reproduit exactement le
          // choix de l'ancienne boucle séquentielle.
          if (
            distance < targetDistance ||
            (distance === targetDistance && target !== null && cluster.seq < target.seq)
          ) {
            target = cluster
            targetDistance = distance
          }
        }
      }
    }

    if (target) {
      // Le centroïde bouge : la cellule d'indexation peut changer.
      const previousKey = cellKey(target.lat, target.lon)
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
      // Prix affiché : le MIN des membres frais (ticket 034).
      const price = freshPrice(marker)
      if (price !== null) {
        target.minPrice = Math.min(target.minPrice ?? Infinity, price)
      }
      // Réindexation si le centroïde a changé de cellule : sans elle, la
      // garantie « un cluster à moins de R est dans les 9 voisines » tombe.
      const nextKey = cellKey(target.lat, target.lon)
      if (nextKey !== previousKey) {
        unindexCluster(target, previousKey)
        indexCluster(target, nextKey)
      }
    } else {
      const created: PendingCluster = {
        markerIds: [marker.id],
        lat: marker.lat,
        lon: marker.lon,
        attractiveness: marker.attractiveness,
        minPrice: freshPrice(marker),
        seq: clusters.length
      }
      clusters.push(created)
      indexCluster(created, cellKey(created.lat, created.lon))
    }
  }

  // `seq` est un détail d'implémentation : il ne sort pas de la fonction.
  const multi: StationCluster[] = clusters
    .filter((cluster) => cluster.markerIds.length > 1)
    .map(({ markerIds, lat, lon, attractiveness, minPrice }) => ({
      markerIds,
      lat,
      lon,
      attractiveness,
      minPrice
    }))
  const clusteredIds = new Set(multi.flatMap((cluster) => cluster.markerIds))
  const individuals = markers
    .filter((m) => m.isReference || m.isRecommended || !clusteredIds.has(m.id))
    .map((m) => m.id)

  return { clusters: multi, individuals }
}
