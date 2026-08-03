<script setup lang="ts">
// StationMap — Carte OpenStreetMap des stations du rayon (ticket 012, spec §4
// step 4, §2.1 carte OSM, NFR-PERF-1). Leaflet est chargé de façon dynamique
// (lazy) pour ne pas alourdir la page principale. Les données viennent de
// useStations (mêmes stations que la liste — aucun appel API supplémentaire,
// aucun service cartographique payant : tuiles OSM libres).
//
// Accessibilité (NFR-ACC-1/2/4, NFR-PWA-2, NFR-RES-1/2) :
//   - sans JavaScript (SSR), seule la liste de repli est rendue : la carte
//     reste lisible sans JS (NFR-PWA-2) ;
//   - si les tuiles ne se chargent pas (hors-ligne), un message explicite et
//     la liste de repli restent visibles ;
//   - libellés aria sur la section, le conteneur et les contrôles de zoom ;
//   - marqueurs non hiérarchiques : forme (rond plein / anneau pointillé) +
//     symbole « S » / « R » — la couleur n'est jamais le seul vecteur
//     d'information (NFR-ACC-4) ; focus visible sur les marqueurs ;
//   - contrôles de zoom ≥ 44 px (NFR-RES-2) et libellés français.
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { buildStationMapView, buildPopupHtml } from '../utils/stationMap'
import type { StationMapView, StationMapMarker } from '../utils/stationMap'
import type { StationsQueryResult } from '../utils/stations'

const props = defineProps<{
  result: StationsQueryResult | null
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const mapReady = ref(false)
const tileError = ref(false)
const mapError = ref<string | null>(null)
const view = ref<StationMapView>({ center: null, markers: [] })

let leaflet: typeof import('leaflet') | null = null
let map: import('leaflet').Map | null = null
let markerLayers: import('leaflet').Marker[] = []
let tileLayer: import('leaflet').TileLayer | null = null
let resizeObserver: ResizeObserver | null = null

const markerCount = computed(() => view.value.markers.length)

watch(
  () => props.result,
  (value) => {
    view.value = buildStationMapView(
      value?.stations ?? [],
      value?.referenceStation ?? null,
      value?.query.center ?? null
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
    }
  }
)

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

    L.control.zoom({ position: 'topleft', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(map)
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

function makeIcon(marker: StationMapMarker, L: typeof import('leaflet')) {
  const cls = marker.isReference ? 'jflp-marker jflp-marker-reference' : 'jflp-marker'
  return L.divIcon({
    className: cls,
    html: `<span class="jflp-marker-char" aria-hidden="true">${marker.isReference ? 'R' : 'S'}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18]
  })
}

function syncMarkers() {
  if (!map || !leaflet) return
  for (const m of markerLayers) {
    map.removeLayer(m)
  }
  markerLayers = []
  for (const marker of view.value.markers) {
    const layer = leaflet
      .marker([marker.lat, marker.lon], {
        icon: makeIcon(marker, leaflet),
        keyboard: true,
        title: marker.name,
        alt: marker.name,
        zIndexOffset: marker.isReference ? 1000 : 0
      })
      .bindPopup(buildPopupHtml(marker), { maxWidth: 260, autoPan: true, closeButton: true })
      .on('click', () => {
        if (map) {
          map.flyTo([marker.lat, marker.lon], Math.max(map.getZoom(), 14))
        }
      })
    layer.addTo(map)
    markerLayers.push(layer)
  }
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (map) {
    map.remove()
    map = null
  }
  markerLayers = []
  tileLayer = null
})
</script>

<template>
  <section class="station-map" aria-label="Carte des stations" data-testid="station-map">
    <header class="station-map-header">
      <h2 class="station-map-title">Carte des stations</h2>
      <p class="station-map-hint">
        {{ markerCount }} station{{ markerCount > 1 ? 's' : '' }} dans le rayon, autour de la position de recherche.
      </p>
    </header>

    <div v-if="mapReady" class="station-map-canvas">
      <div
        ref="containerRef"
        class="jflp-map-container"
        role="region"
        :aria-label="`Carte des ${markerCount} stations dans le rayon`"
        data-testid="station-map-container" />
      <p v-if="tileError" class="station-map-error" role="status">
        Les tuiles de la carte ne sont pas disponibles pour le moment. Utilisez la liste ci-dessous.
      </p>
      <p v-else-if="mapError" class="station-map-error" role="alert">{{ mapError }}</p>
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
  display: grid;
  gap: 0.75rem;
}
.station-map-header {
  display: grid;
  gap: 0.2rem;
}
.station-map-title {
  margin: 0;
  font-size: 1.15rem;
}
.station-map-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.station-map-canvas {
  display: grid;
  gap: 0.6rem;
}
.station-map-error,
.station-map-empty {
  margin: 0;
  padding: 0.8rem 1rem;
  border: 1px dashed var(--border);
  border-radius: 0.6rem;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.9rem;
}
.station-map-note {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
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
  border-radius: 0.6rem;
  background: var(--surface);
}
.station-map-item-name {
  font-weight: 600;
}
.station-map-item-ref {
  font-size: 0.75rem;
  color: var(--accent);
  border: 1px dashed var(--accent);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}
.station-map-item-meta {
  flex-basis: 100%;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.station-map-directions {
  justify-self: start;
}
</style>

<style>
/* ——— Styles Leaflet globaux (DOM généré par Leaflet hors du scoped) ——— */
.jflp-map-container {
  height: 380px;
  width: 100%;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--border);
  z-index: 0;
}
.jflp-map-container .leaflet-container {
  font-family: inherit;
}
/* Marqueurs non hiérarchiques : forme + symbole, pas seulement la couleur
   (NFR-ACC-4). */
.jflp-marker {
  background: transparent;
  border: none;
}
.jflp-marker .jflp-marker-char {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  background: var(--accent);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.45);
}
.jflp-marker-reference .jflp-marker-char {
  width: 34px;
  height: 34px;
  color: var(--accent);
  background: #fff;
  border: 3px dashed var(--accent);
}
.jflp-marker:focus-visible,
.jflp-marker-reference:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
/* Popup */
.jflp-popup {
  min-width: 200px;
  display: grid;
  gap: 0.3rem;
}
.jflp-popup-title {
  margin: 0;
  font-weight: 700;
}
.jflp-popup-line {
  margin: 0;
  font-size: 0.9rem;
}
.jflp-popup-price {
  font-weight: 800;
}
.jflp-popup-freshness {
  margin: 0;
  font-size: 0.78rem;
  color: #6b7280;
}
.jflp-popup-directions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 0.4rem;
  padding: 0 0.9rem;
  border-radius: 0.5rem;
  background: var(--accent);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}
.jflp-popup-directions:hover {
  background: var(--accent-hover);
}
/* Contrôles de zoom ≥ 44 px (NFR-RES-2) et accessibles. */
.jflp-map-container .leaflet-control-zoom a {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}
/* Mode sombre : tuiles filtrées + popups/contrôles cohérents. */
html.dark .jflp-map-container .leaflet-tile {
  filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.8);
}
html.dark .jflp-map-container .leaflet-control-zoom a {
  background: #1f2937;
  color: #f3f4f6;
  border-color: #4b5563;
}
html.dark .jflp-map-container .leaflet-control-zoom a:hover {
  background: #374151;
}
html.dark .jflp-map-container .leaflet-control-attribution {
  background: rgb(17 24 39 / 0.8);
  color: #9ca3af;
}
html.dark .jflp-map-container .leaflet-popup-content-wrapper,
html.dark .jflp-map-container .leaflet-popup-tip {
  background: #1f2937;
  color: #f3f4f6;
}
html.dark .jflp-popup-freshness {
  color: #9ca3af;
}
</style>
