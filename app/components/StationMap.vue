<script setup lang="ts">
// StationMap — Carte OpenStreetMap plein écran des stations du rayon (ticket
// 012, spec §4 step 4, §2.1 carte OSM, NFR-PERF-1 ; écran carte plein viewport,
// docs/design/ui-reference.md). Leaflet est chargé de façon dynamique (lazy)
// pour ne pas alourdir la page principale. Les données viennent de useStations
// (mêmes stations que la liste — aucun appel API supplémentaire, aucun service
// cartographique payant : tuiles OSM libres).
//
// Recherche au déplacement (demande produit « déplacer la carte devrait
// afficher les stations ») : un pan utilisateur (dragend) émet `recenter` avec
// le centre du viewport ; la page relance la recherche (recommandation +
// stations) autour de ce point. Uniquement le drag réel — jamais les flyTo
// programmatiques (clic marqueur, recentrage, nouvelle recherche).
//
// Accessibilité (NFR-ACC-1/2/4, NFR-PWA-2, NFR-RES-1/2) :
//   - sans JavaScript (SSR), seule la liste de repli est rendue : la carte
//     reste lisible sans JS (NFR-PWA-2) ;
//   - si les tuiles ne se chargent pas (hors-ligne), un message explicite et
//     la liste de repli restent visibles ;
//   - libellés aria sur la section, le conteneur et les contrôles de zoom ;
//   - chaque marqueur porte un nom accessible (station + prix, + fraîcheur /
//     recommandée le cas échéant) via `title`, focus visible au clavier ;
//   - la couleur n'est jamais le seul vecteur d'information (NFR-ACC-4) : le
//     prix, la fraîcheur et la recommandation sont toujours doublés de texte ;
//   - contrôles de zoom ≥ 44 px (NFR-RES-2) et libellés français.
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { buildStationMapView, buildPopupHtml, escapeHtml } from '../utils/stationMap'
import { animateMarkerLatLng, rafScheduler } from '../utils/mapAnimation'
import { sameCenter, shouldRecenter } from '../utils/mapRecenter'
import type { StationMapView, StationMapMarker } from '../utils/stationMap'
import { buildStationClusters, clusterRadiusKmForZoom } from '../utils/stationClusters'
import type { StationCluster } from '../utils/stationClusters'
import { brandInitial } from '../utils/stationIdentity'
import type { StationsQueryResult } from '../utils/stations'

const props = defineProps<{
  result: StationsQueryResult | null
  recommendedStationId?: string | null
}>()

// ——— Recherche au déplacement (demande produit : déplacer la carte doit
// afficher les stations de la nouvelle zone). Un pan utilisateur émet
// `recenter` avec le centre du viewport ; la page relance la recherche
// (recommandation + stations) autour de ce point. On écoute `dragend`
// (uniquement un déplacement réel au doigt/souris — jamais un flyTo
// programmatique : clic marqueur, recentrage, nouvelle recherche), avec un
// debounce pour coalescer les pans rapides et un seuil de distance pour ne
// pas rejouer la même recherche pour un micro-déplacement. ———
const emit = defineEmits<{
  recenter: [{ lat: number; lon: number }]
}>()

let recenterTimer: ReturnType<typeof setTimeout> | null = null

const containerRef = ref<HTMLDivElement | null>(null)
const mapReady = ref(false)
const tileError = ref(false)
const mapError = ref<string | null>(null)
const view = ref<StationMapView>({ center: null, markers: [] })

let leaflet: typeof import('leaflet') | null = null
let map: import('leaflet').Map | null = null
let tileLayer: import('leaflet').TileLayer | null = null
// Les couches de marqueurs sont RÉUTILISÉES (Map id → couche) tant qu'une
// station reste un marqueur individuel : on ne supprime/recrée jamais un
// marqueur inchangé au passage d'un zoom. Sans cela, `zoomend` (déclenché par
// le flyTo du clic sur marqueur) reconstruisait toutes les couches et
// détruisait la popup qui venait de s'ouvrir — sur mobile, le touch semblait
// « faire deux fois » (la popup s'ouvrait puis se fermait aussitôt). La popup
// reste ouverte tant que la couche source n'est pas retirée (Leaflet la
// recale pendant les pans/zooms). Les clusters (sans popup) sont eux aussi
// réutilisés par identité de membres, pour ne pas clignoter au zoom.
let markerLayers = new Map<string, import('leaflet').Marker>()
let markerIconSignatures = new Map<string, string>()
let clusterLayers = new Map<string, import('leaflet').Marker>()
let resizeObserver: ResizeObserver | null = null
let lastFlownCenter: { lat: number; lon: number; zoom: number } | null = null

const markerCount = computed(() => view.value.markers.length)

watch(
  [() => props.result, () => props.recommendedStationId],
  ([value, recommendedId]) => {
    view.value = buildStationMapView(
      value?.stations ?? [],
      value?.referenceStation ?? null,
      value?.query.center ?? null,
      recommendedId ?? null
    )
    if (import.meta.client) {
      // La carte peut se monter avant l'arrivée des données (v-if sur la
      // requête, données encore en chargement) : si l'init a échoué faute de
      // centre et qu'un centre est maintenant disponible, on réessaie.
      if (!map && mapError.value && view.value.center) {
        mapError.value = null
      }
      if (!map && !mapError.value) {
        void ensureMap()
      }
    }
  },
  { immediate: true }
)

watch(
  () => view.value,
  () => {
    if (import.meta.client && map) {
      syncMarkers()
      recenterIfNeeded()
    }
  }
)

// ——— Recentre la carte déjà montée quand la position de recherche change
// (nouvelle recherche, bouton « Recentrer sur ma position »). On évite de
// rejouer un flyTo identique à chaque simple rafraîchissement de marqueurs.
// La décision est déléguée à utils/mapRecenter.ts (module pur testé).
//
// Cas critique : recherche déclenchée par un pan. La recommandation répond
// avant la liste des stations : le rebuild intermédiaire porte ENCORE
// l'ancien centre, et un flyTo dessus ramènerait la carte « presque où elle
// était » juste après le déplacement de l'utilisateur. Tant qu'un centre de
// pan (pendingRecenterTarget) est en vol, on ne recentre PAS — l'utilisateur
// contrôle la carte. ———
let pendingRecenterTarget: { lat: number; lon: number } | null = null

function recenterIfNeeded() {
  if (!map) return
  const center = view.value.center
  if (!center) {
    // Pas de centre (données absentes / recherche en erreur) : la recherche
    // par pan a résolu sans données — on relâche le verrou de recentrage.
    clearPendingRecenter()
    return
  }
  // Le centre du pan a rejoint les données : la recherche par pan est
  // terminée, on relâche le verrou.
  if (pendingRecenterTarget && sameCenter(center, pendingRecenterTarget)) {
    clearPendingRecenter()
  }
  // La comparaison se fait sur lat/lon SEULS (le zoom de `view.center` est
  // toujours le zoom de départ MAP_START_ZOOM, alors que `lastFlownCenter`
  // porte le zoom réel de la carte après un pan/zoom utilisateur) : un même
  // centre n'est jamais re-flyé, et le flyTo garde le zoom courant via
  // Math.max.
  const { fly, target } = shouldRecenter({
    dataCenter: { lat: center.lat, lon: center.lon },
    panSearchCenter: pendingRecenterTarget,
    lastFlownCenter: lastFlownCenter ? { lat: lastFlownCenter.lat, lon: lastFlownCenter.lon } : null
  })
  if (!fly || !target) return
  // Un re-centrage programmatique arrive justement sur le centre de recherche :
  // le `dragend` d'un éventuel pan en cours n'étant pas concerné, rien à
  // supprimer ici. On annule simplement un debounce de pan en cours pour ne
  // pas rejouer l'ancien centre.
  cancelRecenter()
  lastFlownCenter = { ...center }
  map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), center.zoom))
}

// ——— Fin d'un pan utilisateur → recherche au nouveau centre ———
// `dragend` est déclenché à la fin d'un drag réel ; l'évènement porte le
// centre courant du viewport. Un seuil de distance (relative au rayon affiché
// à l'écran) évite de relancer une recherche quasi identique pour un
// micro-déplacement ; le debounce coalesce les drags rapides.
const RECENTER_DEBOUNCE_MS = 500
const RECENTER_MIN_DRAG_FRACTION = 0.15
let lastRecenterCenter: { lat: number; lon: number } | null = null

function onMapDragEnd() {
  if (!map) return
  const center = map.getCenter()
  const centerLat = center.lat
  const centerLng = center.lng
  const zoom = map.getZoom()
  // Le pan « réclame » le centre courant : quand les nouvelles données
  // arrivent avec query.center = ce centre, recenterIfNeeded ne doit pas
  // rejouer un flyTo (il ne ferait que lutter contre le déplacement).
  lastFlownCenter = { lat: centerLat, lon: centerLng, zoom }
  // Largeur d'écran en km au zoom courant — borne la « taille » d'un drag
  // en coordonnées monde pour le seuil relatif.
  const metersPerPixel = 40075016.686 * Math.cos((centerLat * Math.PI) / 180) / Math.pow(2, zoom + 8)
  const viewportWidthKm = (metersPerPixel / 1000) * (map.getSize().x || 0)
  const thresholdKm = viewportWidthKm * RECENTER_MIN_DRAG_FRACTION

  if (
    lastRecenterCenter &&
    Math.abs(centerLat - lastRecenterCenter.lat) < thresholdKm / 111 &&
    Math.abs(centerLng - lastRecenterCenter.lon) < thresholdKm / 111
  ) {
    return
  }
  lastRecenterCenter = { lat: centerLat, lon: centerLng }

  cancelRecenter()
  recenterTimer = setTimeout(() => {
    recenterTimer = null
    lastRecenterCenter = null
    pendingRecenterTarget = { lat: centerLat, lon: centerLng }
    emit('recenter', { lat: centerLat, lon: centerLng })
  }, RECENTER_DEBOUNCE_MS)
}

function cancelRecenter() {
  if (recenterTimer !== null) {
    clearTimeout(recenterTimer)
    recenterTimer = null
  }
}

// ——— Fin d'une recherche déclenchée par un pan : le centre du pan a été
// appliqué (ou abandonné), on relâche le verrou de recentrage. ———
function clearPendingRecenter() {
  pendingRecenterTarget = null
}

async function ensureMap() {
  if (!import.meta.client) return
  if (map || mapError.value) return
  try {
    const L = await import('leaflet')
    await import('leaflet/dist/leaflet.css')
    leaflet = L

    mapReady.value = true
    await nextTick()
    if (!containerRef.value) return

    const center = view.value.center
    if (!center) {
      mapError.value = 'Impossible de positionner la carte sans coordonnées.'
      return
    }

    map = L.map(containerRef.value, {
      center: [center.lat, center.lon],
      zoom: center.zoom,
      minZoom: 6,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
      keyboard: true
    })
    lastFlownCenter = center

    L.control
      .zoom({ position: 'bottomright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' })
      .addTo(map)
    // Libellés aria sur les contrôles de zoom (NFR-ACC-3).
    for (const [i, el] of Array.from(map.getContainer().querySelectorAll('.leaflet-control-zoom a')).entries()) {
      el.setAttribute('aria-label', i === 0 ? 'Zoomer' : 'Dézoomer')
    }

    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      crossOrigin: true
    }).addTo(map)
    tileLayer.on('tileerror', () => {
      tileError.value = true
    })

    syncMarkers()
    // Clustering dynamique selon le zoom (choix produit) : à chaque
    // changement de zoom, on recalcule clusters ET marqueurs individuels —
    // les stations qui ne se chevauchent plus après un zoom avant
    // réapparaissent aussitôt.
    map.on('zoomend', () => syncMarkers())

    // Recherche au déplacement : `dragend` ne se déclenche QUE pour un pan
    // réel de l'utilisateur (doigt/souris), jamais pour un flyTo programmatique
    // (clic marqueur, recentrage, nouvelle recherche). Debounce + seuil de
    // distance pour ne pas spammer l'API pendant un pan continu.
    map.on('dragend', onMapDragEnd)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(containerRef.value)
    }
    window.setTimeout(() => map?.invalidateSize(), 50)
  } catch {
    mapReady.value = true
    mapError.value = 'La carte ne peut pas être chargée.'
  }
}

function accessibleName(marker: StationMapMarker): string {
  const parts = [marker.name, marker.priceLabel]
  if (marker.isRecommended) parts.push('station recommandée')
  if (marker.isReference) parts.push('station de référence')
  if (marker.isStale) parts.push(`${marker.freshnessLabel} — ${marker.ageLabel}`)
  return parts.join(' — ')
}

// ——— Marqueur cluster (regroupement des marqueurs superposés ; demande
// produit + design ui-reference.md §5 « Clusters — disques portant le dégradé
// de leur station la plus verte »). Le cluster est un vrai point Leaflet :
// focusable au clavier et cliquable pour zoomer vers son centroïde.
// L'accessibilité (NFR-ACC-4 : la couleur n'est jamais le seul vecteur) est
// portée par le nom accessible du marker, pas par un label visuel. ———

// ——— Mise à jour fluide d'un marqueur existant (pan → nouvelles coordonnées
// des stations, clustering). Le marqueur Leaflet est un divIcon posé en dur
// sur la coordonnée : un `setLatLng` direct pendant le pan le ferait « sauter »
// d'une station à l'autre. On anime donc le passage progressif au point visé
// (interpolation linéaire de la lat/lon, utils/mapAnimation.ts) — le badge
// reste fixé à la station et glisse avec elle, au lieu de disparaître/
// réapparaître (demande produit « déplacer la carte devrait y aller
// progressivement »). ———
function setMarkerLatLng(layer: import('leaflet').Marker, target: { lat: number; lon: number }) {
  if (leaflet) {
    animateMarkerLatLng(
      layer,
      { lat: target.lat, lng: target.lon },
      // Le RAF réel : l'animation suit le composé de la carte, pas un timer.
      rafScheduler
    )
  } else {
    layer.setLatLng([target.lat, target.lon])
  }
}

function makeIconCluster(cluster: StationCluster, L: typeof import('leaflet')) {
  const count = cluster.markerIds.length
  // Le cluster porte le dégradé d'attractivité de sa station la plus
  // « verte » (la moins chère du groupe) : même palette que les marqueurs.
  // Sans attractivité (référence absente du cluster, données partielles), le
  // disque reste neutre (terracotta, la valeur par défaut de .jflp-cluster).
  const tierClass = cluster.attractiveness === null
    ? ''
    : `jflp-cluster-tier-${Math.min(4, Math.max(0, Math.round(cluster.attractiveness * 4)))}`
  const html = `<span class="jflp-cluster ${tierClass}" aria-hidden="true">${count}</span>`
  return L.divIcon({
    className: 'jflp-cluster-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, 0]
  })
}

function clusterAccessibleName(cluster: StationCluster): string {
  return `${cluster.markerIds.length} stations regroupées`
}

function clusterKey(cluster: StationCluster): string {
  return cluster.markerIds.slice().sort().join(',')
}

function syncClusters(clusters: StationCluster[]) {
  if (!map || !leaflet) return
  const seen = new Set<string>()
  for (const cluster of clusters) {
    const key = clusterKey(cluster)
    seen.add(key)
    let layer = clusterLayers.get(key)
    if (!layer) {
      layer = leaflet
        .marker([cluster.lat, cluster.lon], {
          icon: makeIconCluster(cluster, leaflet),
          keyboard: true,
          title: clusterAccessibleName(cluster),
          alt: clusterAccessibleName(cluster),
          zIndexOffset: 500
        })
        .on('click', () => {
          if (map) {
            map.flyTo([cluster.lat, cluster.lon], Math.max(map.getZoom() + 1, 14))
          }
        })
      layer.addTo(map)
      // Le disque apparaît en fondu, comme les marqueurs (rien ne saute).
      const el = layer.getElement()
      if (el) {
        el.style.opacity = '0'
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 0.25s ease'
          el.style.opacity = '1'
        })
      }
      clusterLayers.set(key, layer)
    }
    // Le cluster est réutilisé par identité de membres : son centroïde peut
    // se déplacer (membres recombinés au pan/zoom) — on l'anime, comme les
    // marqueurs. Si son attractivité a changé (nouveaux prix), on met à jour
    // l'icône du disque existant.
    setMarkerLatLng(layer, { lat: cluster.lat, lon: cluster.lon })
    const tier = cluster.attractiveness === null
      ? ''
      : `jflp-cluster-tier-${Math.min(4, Math.max(0, Math.round(cluster.attractiveness * 4)))}`
    const current = layer.getElement()?.querySelector('.jflp-cluster')
    if (current && !current.classList.contains(tier) && tier !== '') {
      current.className = `jflp-cluster ${tier}`
    }
  }
  for (const [key, layer] of clusterLayers) {
    if (!seen.has(key)) {
      map.removeLayer(layer)
      clusterLayers.delete(key)
    }
  }
}

function makeIcon(marker: StationMapMarker, L: typeof import('leaflet')) {
  const classes = ['jflp-marker']
  if (marker.isReference) classes.push('jflp-marker-reference')
  if (marker.isRecommended) classes.push('jflp-marker-recommended')
  if (marker.isStale) classes.push('jflp-marker-stale')
  // Le badge porte le dégradé d'attractivité du prix (0 → terracotta « Plus
  // cher », 1 → vert « Moins cher ») en fond de l'ergot et du liseré. La
  // couleur n'est jamais le seul vecteur (NFR-ACC-4) : le prix est en texte
  // et le nom accessible porte l'état. Sans attractivité (référence) ou prix
  // périmé, le badge reste neutre.
  const tierClass = marker.attractiveness === null
    ? 'pill-outline'
    : `jflp-price-badge-tier-${Math.min(4, Math.max(0, Math.round(marker.attractiveness * 4)))}`

  const recoHtml = marker.isRecommended
    ? `<span class="pill pill-accent pill-raised jflp-reco-badge">★ Recommandée</span>`
    : ''
  // Logo d'enseigne seul à gauche du prix (docs/design/ui-reference.md §4 —
  // la signature visuelle cible, ticket 021). Décoratif : le nom réel est
  // porté par le nom accessible et la popup (NFR-ACC-4). L'URL est déjà
  // validée côté utils/stationMap ; sans logo, pastille initiale — jamais une
  // image cassée ni un id.
  const logoHtml = marker.logoUrl
    ? `<img class="jflp-price-badge-logo" src="${escapeHtml(marker.logoUrl)}" alt="" width="14" height="14" loading="lazy" onerror="this.remove()" />`
    : marker.brand
      ? `<span class="jflp-price-badge-logo jflp-price-badge-logo-fallback" aria-hidden="true">${escapeHtml(brandInitial(marker.brand) || '⛽')}</span>`
      : ''
  const freshHtml = marker.isStale ? `<span class="jflp-price-badge-fresh" aria-hidden="true">⏱</span>` : ''

  const html =
    `<div class="jflp-badge-stack">` +
    recoHtml +
    `<span class="pill pill-raised jflp-price-badge ${tierClass}">` +
    logoHtml +
    `<span class="jflp-price-badge-price">${marker.markerPriceLabel}</span>` +
    freshHtml +
    `</span>` +
    `<span class="jflp-price-badge-arrow" aria-hidden="true"></span>` +
    `</div>`

  return L.divIcon({
    className: classes.join(' '),
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -58]
  })
}

function iconSignature(marker: StationMapMarker): string {
  // Un marqueur est réutilisé tant que son « apparence » ne change pas : même
  // état (référence / recommandée / périmée) et même texte de prix. Si un seul
  // de ces éléments change (nouvelle recommandation, prix rafraîchi), on met
  // à jour l'icône du marqueur EXISTANT au lieu de le supprimer/recréer —
  // une popup ouverte sur lui n'est pas perdue. Seuls les marqueurs réellement
  // absents sont retirés de la carte.
  const flags = [
    marker.isReference && 'r',
    marker.isRecommended && 'R',
    marker.isStale && 's'
  ]
    .filter(Boolean)
    .join('')
  return `${flags}|${marker.markerPriceLabel}|${marker.logoUrl ?? ''}|${marker.attractiveness ?? ''}`
}

function syncMarkers() {
  if (!map || !leaflet) return
  const zoom = map.getZoom()
  const radius = clusterRadiusKmForZoom(zoom)
  const clustered = buildStationClusters(view.value.markers, radius)
  const byId = new Map(view.value.markers.map((m) => [m.id, m]))

  // Marqueurs individuels : les stations hors de tout cluster PLUS les
  // points d'ancrage (référence / recommandée), qui ne sont jamais
  // regroupées — leur badge reste visible (la réponse n'est jamais enfouie).
  const seen = new Set<string>()
  for (const id of clustered.individuals) {
    const marker = byId.get(id)
    if (!marker) continue
    seen.add(id)
    let layer = markerLayers.get(id)
    if (!layer) {
      layer = leaflet
        .marker([marker.lat, marker.lon], {
          icon: makeIcon(marker, leaflet),
          keyboard: true,
          title: accessibleName(marker),
          alt: accessibleName(marker),
          zIndexOffset: marker.isRecommended ? 2000 : marker.isReference ? 1000 : 0
        })
        .bindPopup(buildPopupHtml(marker), { maxWidth: 260, autoPan: true, closeButton: true })
        .on('click', () => {
          if (map) {
            map.flyTo([marker.lat, marker.lon], Math.max(map.getZoom(), 14))
          }
        })
      layer.addTo(map)
      // Le badge apparaît en fondu (rien ne « pop »).
      const el = layer.getElement()
      if (el) {
        el.style.opacity = '0'
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 0.25s ease'
          el.style.opacity = '1'
        })
      }
      markerLayers.set(id, layer)
    }
    // La position suit TOUJOURS la station (même si l'apparence ne change
    // pas) : quand le pan renvoie de nouvelles coordonnées, le badge glisse
    // progressivement au lieu de sauter (demande produit).
    setMarkerLatLng(layer, { lat: marker.lat, lon: marker.lon })
    const signature = iconSignature(marker)
    if (markerIconSignatures.get(id) !== signature) {
      layer.setIcon(makeIcon(marker, leaflet))
      layer.setZIndexOffset(marker.isRecommended ? 2000 : marker.isReference ? 1000 : 0)
      // Le contenu de la popup doit suivre l'état (prix / fraîcheur) : la
      // réouvrir si elle était ouverte sur ce marqueur.
      if (layer.isPopupOpen()) {
        layer.setPopupContent(buildPopupHtml(marker))
      }
      layer.options.title = accessibleName(marker)
      layer.options.alt = accessibleName(marker)
      markerIconSignatures.set(id, signature)
    }
  }

  // Retirer les marqueurs qui ne sont plus individuels (entrés dans un
  // cluster) ou qui ont disparu des données.
  for (const [id, layer] of markerLayers) {
    if (!seen.has(id)) {
      map.removeLayer(layer)
      markerLayers.delete(id)
      markerIconSignatures.delete(id)
    }
  }

  syncClusters(clustered.clusters)
}

onBeforeUnmount(() => {
  cancelRecenter()
  resizeObserver?.disconnect()
  resizeObserver = null
  if (map) {
    map.remove()
    map = null
  }
  markerLayers = new Map()
  markerIconSignatures = new Map()
  clusterLayers = new Map()
  tileLayer = null
})
</script>

<template>
  <section class="station-map" aria-label="Carte des stations" data-testid="station-map">
    <h2 class="sr-only">Carte des stations</h2>

    <div v-if="mapReady" class="station-map-canvas">
      <div
        ref="containerRef"
        class="jflp-map-container"
        role="region"
        :aria-label="`Carte des ${markerCount} stations dans le rayon`"
        data-testid="station-map-container" />
      <p v-if="tileError" class="station-map-error pill pill-raised" role="status">
        Les tuiles de la carte ne sont pas disponibles pour le moment. Utilisez la liste ci-dessous.
      </p>
      <p v-else-if="mapError" class="station-map-error pill pill-raised" role="alert">{{ mapError }}</p>
    </div>

    <div v-else class="station-map-fallback" data-testid="station-map-fallback">
      <p v-if="markerCount === 0" class="station-map-empty" role="status">
        Aucune station à afficher sur la carte.
      </p>
      <template v-else>
        <p class="station-map-note">
          La carte n’est pas disponible ici. Les stations du rayon, avec prix, distance et fraîcheur :
        </p>
        <ul class="station-map-list">
          <li v-for="marker in view.markers" :key="marker.id" class="station-map-item">
            <span class="station-map-item-name">{{ marker.name }}</span>
            <span v-if="marker.isRecommended" class="station-map-item-reco pill pill-accent">★ Recommandée</span>
            <span v-if="marker.isReference" class="station-map-item-ref">Station de référence</span>
            <span class="station-map-item-meta">
              {{ marker.priceLabel }} — {{ marker.distanceLabel }} — {{ marker.freshnessLabel }}
              <template v-if="marker.ageLabel"> ({{ marker.ageLabel }})</template>
            </span>
            <a
              :href="marker.directionsUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-secondary station-map-directions"
            >
              Itinéraire
            </a>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.station-map {
  /* Pas de height/width explicites : le parent (pages/index.vue, classe
     .map-layer) contrôle la géométrie via un positionnement absolu top/
     right/bottom/left — un height:100% ici court-circuiterait son `bottom`
     (une boîte positionnée en absolu avec une hauteur explicite ignore
     `bottom`, cf. CSS 2.1 §10.6.4), et la carte déborderait sous la feuille. */
  position: absolute;
  inset: 0;
}
.station-map-canvas {
  height: 100%;
  width: 100%;
  position: relative;
}
.station-map-error {
  position: absolute;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  z-index: var(--z-overlay);
  color: var(--text-700);
}
.station-map-empty,
.station-map-note {
  margin: 0;
  padding: 0.9rem 1rem;
  color: var(--text-700);
  font-size: 0.9rem;
}
.station-map-fallback {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
}
.station-map-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.station-map-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
}
.station-map-item-name {
  font-weight: 600;
}
.station-map-item-reco,
.station-map-item-ref {
  font-size: 0.75rem;
}
.station-map-item-ref {
  color: var(--text-700);
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}
.station-map-item-meta {
  flex-basis: 100%;
  font-size: 0.85rem;
  color: var(--text-700);
}
.station-map-directions {
  justify-self: start;
}
</style>

<style>
/* ——— Styles Leaflet globaux (DOM généré par Leaflet hors du scoped) ———
   Tout est posé sur des tokens (assets/css/main.css) : aucune couleur, ombre
   ou rayon en dur (contrat docs/design/ui-reference.md). */
.jflp-map-container {
  height: 100%;
  width: 100%;
  z-index: 0;
}
.jflp-map-container .leaflet-container {
  font-family: inherit;
  background: var(--slate-100);
}

/* ═══ Marqueurs — badge de prix, la signature visuelle de l'écran carte ═══
   L'icône Leaflet elle-même est réduite à un point 0×0 exactement sur la
   coordonnée ; le badge visible est un enfant absolument positionné et
   recentré par translate(-50%, -100%), pour que la pointe de l'ergot touche
   toujours la coordonnée réelle, quelle que soit la largeur du badge (nom
   d'enseigne variable). */
.jflp-marker {
  width: 0;
  height: 0;
  overflow: visible;
  background: transparent;
  border: none;
}
.jflp-badge-stack {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  cursor: pointer;
}
.jflp-reco-badge {
  font-size: 0.68rem;
  padding: 0.15rem 0.55rem;
  white-space: nowrap;
}
.jflp-price-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  padding: 0.3rem 0.6rem;
  white-space: nowrap;
  /* Fond OPAQUE par défaut (repli sûr avant l'application des paliers) :
     le badge ne laisse jamais transparaître les tuiles sous-jacentes. */
  background: var(--surface);
  border: 1px solid var(--border);
}
/* ═══ Dégradé d'attractivité du prix (docs/design/ui-reference.md §4 :
   « la couleur du liseré/fond encode le prix : vert = moins cher, terracotta
   = plus cher »). La bande est l'interpolation de 0 (Plus cher) à 1 (Moins
   cher) autour de la station de référence, quantifiée en 5 paliers
   (0–4) : dégradé perçu en rampe, sans discontinuité — deux marqueurs de
   prix proches ont des teintes proches. Le FOND du badge porte la couleur
   (demande produit) : chaque palier est un fond plein avec du texte blanc
   (--marker-tier-on-fill, ≥ 5,8:1 — NFR-ACC-2), identique en clair/sombre
   (posé sur les tuiles OSM claires). La couleur n'est jamais le seul vecteur
   (NFR-ACC-4) : le prix reste en texte dans le badge. */
.jflp-price-badge.jflp-price-badge-tier-0,
.jflp-price-badge.jflp-price-badge-tier-1,
.jflp-price-badge.jflp-price-badge-tier-2,
.jflp-price-badge.jflp-price-badge-tier-3,
.jflp-price-badge.jflp-price-badge-tier-4 {
  border: 1px solid transparent;
  box-shadow: var(--shadow-md);
  color: var(--marker-tier-on-fill);
}
/* Plus cher (0) — terracotta pur ; progression vers le vert par pas de 25 %
   sur la bande, en passant par un neutre lisible qui porte le blanc.
   Spécificité > .pill (fond blanc par défaut du badge) : le fond plein
   l'emporte quel que soit l'ordre d'injection des chunks CSS. */
.jflp-price-badge.jflp-price-badge-tier-0 {
  background: var(--marker-tier-0);
}
.jflp-price-badge.jflp-price-badge-tier-1 {
  background: var(--marker-tier-1);
}
.jflp-price-badge.jflp-price-badge-tier-2 {
  background: var(--marker-tier-2);
}
.jflp-price-badge.jflp-price-badge-tier-3 {
  background: var(--marker-tier-3);
}
.jflp-price-badge.jflp-price-badge-tier-4 {
  background: var(--marker-tier-4);
}
/* Le logo garde sa pastille sur fond blanc, lisible sur tous les paliers. */
.jflp-price-badge-tier-0 .jflp-price-badge-logo,
.jflp-price-badge-tier-1 .jflp-price-badge-logo,
.jflp-price-badge-tier-2 .jflp-price-badge-logo,
.jflp-price-badge-tier-3 .jflp-price-badge-logo,
.jflp-price-badge-tier-4 .jflp-price-badge-logo {
  background: var(--surface);
}
/* L'ergot est un FRÈRE du badge (`<span class="...badge">…</span><span
   class="jflp-price-badge-arrow">`) : on le colore avec le sélecteur de frère
   adjacent, pour qu'il suive la couleur du fond (dégradé) au lieu d'être
   blanc neutre. */
.jflp-price-badge-tier-0 + .jflp-price-badge-arrow {
  border-top-color: var(--marker-tier-0);
}
.jflp-price-badge-tier-1 + .jflp-price-badge-arrow {
  border-top-color: var(--marker-tier-1);
}
.jflp-price-badge-tier-2 + .jflp-price-badge-arrow {
  border-top-color: var(--marker-tier-2);
}
.jflp-price-badge-tier-3 + .jflp-price-badge-arrow {
  border-top-color: var(--marker-tier-3);
}
.jflp-price-badge-tier-4 + .jflp-price-badge-arrow {
  border-top-color: var(--marker-tier-4);
}
/* Logo d'enseigne : pastille ronde à gauche du prix (signature visuelle de
   l'écran carte, docs/design/ui-reference.md §4). Décoratif (alt vide) ;
   le repli est une pastille portant l'initiale de l'enseigne — jamais une
   image cassée (ticket 021, NFR-ACC-4). */
.jflp-price-badge-logo {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 5px;
  object-fit: cover;
  object-position: center;
  background: var(--surface);
}
.jflp-price-badge-logo-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 800;
  color: var(--text-700);
  border: 1px solid var(--border);
}
.jflp-price-badge-price {
  font-weight: 800;
}
/* Le prix est explicitement BLANC sur tous les paliers du dégradé
   (--marker-tier-on-fill, ≥ 5,8:1 — NFR-ACC-2) : la spécificité (0,3,0)
   écrase toute couleur héritée de .pill / .pill-outline et toute atténuation
   qui délaverait le texte. */
.jflp-price-badge.jflp-price-badge-tier-0 .jflp-price-badge-price,
.jflp-price-badge.jflp-price-badge-tier-1 .jflp-price-badge-price,
.jflp-price-badge.jflp-price-badge-tier-2 .jflp-price-badge-price,
.jflp-price-badge.jflp-price-badge-tier-3 .jflp-price-badge-price,
.jflp-price-badge.jflp-price-badge-tier-4 .jflp-price-badge-price {
  color: var(--marker-tier-on-fill);
}
.jflp-price-badge-fresh {
  font-size: 0.72rem;
  line-height: 1;
}
.jflp-price-badge-arrow {
  width: 0;
  height: 0;
  margin-top: -2px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 7px solid var(--surface);
}
/* Marqueur station de référence : liseré supplémentaire discret, en plus du
   texte "station de référence" porté par le nom accessible (NFR-ACC-4). Elle
   porte le dégradé comme les autres (son prix égale la base → milieu 0,5) ;
   le liseré la distingue. */
.jflp-marker-reference .jflp-price-badge {
  box-shadow: 0 0 0 2px var(--border-strong);
}
/* Prix > 24 h (CONTEXT.md §Fraîcheur) : signalé SANS transparence ni texte
   délavé — le badge garde un fond opaque et son prix bien contrasté, la
   bordure passe en pointillés et le glyphe ⏱ reste (jamais `opacity < 1` :
   ce serait un fond semi-transparent ou un texte délavé). */
.jflp-marker-stale .jflp-price-badge {
  border-style: dashed;
}
.jflp-marker:focus-visible .jflp-badge-stack {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
  border-radius: var(--r-lg);
}

/* ═══ Clusters — regroupement des marqueurs superposés (design
   ui-reference.md §5 : « disques portant le dégradé de leur station la plus
   verte »). L'icône Leaflet est un point 0×0 recentré par translate(-50%,
   -50%) ; le disque porte le nombre (NFR-ACC-4 : jamais la couleur seule),
   le nom accessible est porté par le marker. Fond par défaut
   --terracotta-fill / --terracotta-on-fill (texte blanc lisible, 5,8:1) ;
   les paliers --marker-tier-* (mêmes que les marqueurs) prennent le relais
   quand le cluster a une attractivité connue. Identique en clair et en
   sombre (posé sur les tuiles OSM claires, comme les marqueurs de prix). */
.jflp-cluster-marker {
  width: 0;
  height: 0;
  overflow: visible;
  background: transparent;
  border: none;
}
.jflp-cluster {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  background: var(--terracotta-fill);
  color: var(--terracotta-on-fill);
  font-weight: 800;
  font-size: 0.95rem;
  box-shadow: var(--shadow-md);
  cursor: pointer;
}
/* ═══ Clusters dégradés — le disque porte le dégradé d'attractivité de sa
   station la plus « verte » (la moins chère du groupe), même palette que les
   marqueurs (docs/design/ui-reference.md §5). Texte blanc (--marker-tier-on-
   fill, AA) ; sans attractivité le disque reste terracotta (défaut). */
.jflp-cluster.jflp-cluster-tier-0 {
  background: var(--marker-tier-0);
  color: var(--marker-tier-on-fill);
}
.jflp-cluster.jflp-cluster-tier-1 {
  background: var(--marker-tier-1);
  color: var(--marker-tier-on-fill);
}
.jflp-cluster.jflp-cluster-tier-2 {
  background: var(--marker-tier-2);
  color: var(--marker-tier-on-fill);
}
.jflp-cluster.jflp-cluster-tier-3 {
  background: var(--marker-tier-3);
  color: var(--marker-tier-on-fill);
}
.jflp-cluster.jflp-cluster-tier-4 {
  background: var(--marker-tier-4);
  color: var(--marker-tier-on-fill);
}
.jflp-cluster-label {
  position: absolute;
  left: 50%;
  top: calc(50% + 30px);
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-900);
  background: var(--surface);
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
}
.jflp-cluster-marker:focus-visible .jflp-cluster {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}

/* ═══ Popups — surface chaude, coins arrondis, ombre teintée (pas la popup
   blanche par défaut à coins carrés) ═══ */
.jflp-map-container .leaflet-popup-content-wrapper {
  background: var(--surface);
  color: var(--text-900);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-md);
}
.jflp-map-container .leaflet-popup-content {
  margin: 0.85rem 1rem;
}
.jflp-map-container .leaflet-popup-tip {
  background: var(--surface);
  box-shadow: none;
}
.jflp-map-container .leaflet-popup-close-button {
  color: var(--text-700);
}
.map-popup {
  display: grid;
  gap: 0.3rem;
  min-width: 190px;
}
.map-popup-reco {
  justify-self: start;
  font-size: 0.72rem;
}
.map-popup-title {
  margin: 0;
  font-weight: 700;
  color: var(--text-900);
}
/* Enseigne + logo dans la popup (ticket 021). Le logo est décoratif (alt
   vide) ; le nom réel reste en texte dans .map-popup-title (NFR-ACC-4). */
.map-popup-brand {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-700);
}
.map-popup-logo {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  object-fit: cover;
  object-position: center;
  background: var(--surface);
}
.map-popup-logo-fallback {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: var(--slate-100);
  color: var(--text-700);
  border: 1px solid var(--border);
  font-size: 0.72rem;
  font-weight: 800;
}
.map-popup-line {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-900);
}
.map-popup-price {
  font-weight: 800;
}
.map-popup-freshness {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-700);
}
.map-popup-directions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 0.4rem;
  padding: 0 0.9rem;
  border-radius: var(--r-pill);
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}
.map-popup-directions:hover {
  background: var(--accent-hover);
}

/* ═══ Contrôles de zoom — boutons ronds blancs, ombre chaude (comme les
   .fab de la carte), plutôt que le carré Leaflet par défaut ═══ */
.jflp-map-container .leaflet-control-zoom {
  border: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0 0.75rem calc(var(--nav-h) + 6.5rem) 0;
}
.jflp-map-container .leaflet-control-zoom a {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  line-height: 44px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-900);
  box-shadow: var(--shadow-md);
  border: none;
  font-size: 1.2rem;
}
.jflp-map-container .leaflet-control-zoom a:hover {
  background: var(--slate-100);
}

/* ═══ Attribution — scrim neutre, lisible sur tuiles claires quel que soit
   le thème (pas un token de marque : simple voile de lisibilité). ═══ */
.jflp-map-container .leaflet-control-attribution {
  background: rgba(255, 255, 255, 0.75);
  color: var(--text-700);
  font-size: 0.7rem;
  border-radius: var(--r-md) 0 0 0;
}
html.dark .jflp-map-container .leaflet-control-attribution {
  background: rgba(20, 16, 13, 0.6);
}

/* Mode sombre : les tuiles OpenStreetMap restent CLAIRES (docs/design/
   ui-reference.md §« Tokens — marqueurs de prix »). L'ancien filtre
   invert(1) hue-rotate(180°)… leur donnait l'aspect d'un fond satellite sombre
   et illisible. Les marqueurs (--marker-*) sont identiques en clair et en
   sombre, posés sur des tuiles claires : aucun filtre n'est appliqué ici, la
   carte reste lisible dans les deux thèmes. */
</style>
