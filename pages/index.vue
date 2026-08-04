<script setup lang="ts">
// pages/index.vue — Écran carte plein viewport « Je fais le plein ou non ? »
// (ticket 010 + redesign docs/design/ui-reference.md : la carte est le fond
// de l'écran, tout le reste flotte par-dessus ou vit dans une bottom sheet).
// Parcours spec §4 : bannière de consentement géoloc (non bloquante, LOC-1),
// rayon (5/10/20/30, défaut 10, LOC-3) et carburant préféré (CAR-2) mémorisés
// localement, recherche ville/CP sans géolocalisation (LOC-2). Affichage
// immédiat de la recommandation fournie par l'API (009) — l'UI ne recalculera
// jamais les règles (REC-2/D1). États : chargement, erreur, données
// insuffisantes, fraîcheur > 24 h atténuée.
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useHead } from '#imports'
import { FUEL_OPTIONS } from '../utils/fuel'
import { usePreferences, RADIUS_OPTIONS } from '../composables/usePreferences'
import { useGeolocation } from '../composables/useGeolocation'
import { useFuelRecommendation } from '../composables/useFuelRecommendation'
import { useStations } from '../composables/useStations'
import { saveLocation } from '../utils/location'
import { OSM_ATTRIBUTION_NOTE } from '../utils/stationIdentity'
import type { RecommendationRequest } from '../utils/recommendation'
import type { StationsRequest } from '../utils/stations'

useHead({
  title: 'Je fais le plein ou non ?',
  meta: [
    {
      name: 'description',
      content:
        'Sachez si vous devez faire le plein maintenant, attendre, ou aller dans une autre station, à partir des prix officiels des carburants.'
    }
  ],
  link: [{ rel: 'icon', href: '/favicon.ico' }]
})

const prefs = usePreferences()
const geo = useGeolocation()
const reco = useFuelRecommendation()
const stations = useStations()

const searchMessage = ref<string | null>(null)
const appliedLocation = ref<{ label: string; mode: 'geo' | 'query' } | null>(null)
const stationsRequest = ref<StationsRequest | null>(null)

// ——— Déclenche une recherche avec un payload RecommendationRequest ———
async function run(request: RecommendationRequest, label: string, mode: 'geo' | 'query') {
  // Une recherche montre ses résultats : on ouvre la feuille (elle a pu être
  // repliée au premier affichage pour laisser la place à la bannière de
  // consentement — voir onMounted).
  if (sheetState.value === 'collapsed') {
    sheetState.value = 'medium'
  }
  appliedLocation.value = { label, mode }
  await reco.refresh(request)
  stationsRequest.value = {
    radius: request.radius,
    fuel: request.fuel,
    lat: request.lat,
    lon: request.lon,
    q: request.q,
    city: request.city,
    postalCode: request.postalCode
  }
}

// ——— Bouton « Recentrer sur ma position » (FAB carte) ———
async function locate() {
  const result = await geo.request()
  if (result.ok && geo.position.value) {
    await run(
      {
        lat: geo.position.value.lat,
        lon: geo.position.value.lon,
        radius: prefs.radius.value,
        fuel: prefs.fuel.value
      },
      'ma position',
      'geo'
    )
  } else {
    // erreur compréhensible déjà dans geo.geolocationError ; pas de donnée inventée
    if (!result.denied) {
      searchMessage.value = result.error ?? 'Impossible de vous localiser.'
    }
  }
}

// ——— Recherche ville / code postal (LOC-2) ———
function searchByQuery(q: string) {
  const raw = q.trim()
  if (raw.length === 0) {
    return
  }
  const isPostal = /^\d{5}$/.test(raw)
  const payload: RecommendationRequest = {
    radius: prefs.radius.value,
    fuel: prefs.fuel.value
  }
  if (isPostal) {
    payload.postalCode = raw
  } else {
    payload.q = raw
  }
  geo.setSavedQuery({ source: isPostal ? 'postalCode' : 'city', q: raw })
  saveLocation({ source: isPostal ? 'postalCode' : 'city', q: raw })
  searchMessage.value = null
  run(payload, raw, 'query')
}

// ——— Rejeu de la dernière recherche ville/CP au retour sur la page (spec §14 :
// « afficher immédiatement » — la dernière recherche n'est jamais perdue). La
// position précise (géoloc) n'est jamais persistée (LOC-4). ———
onMounted(() => {
  // En mobile, la bannière de consentement ne se montre que feuille repliée
  // (consentBannerVisible) : on force ce départ pour qu'elle soit visible et
  // interactive dès le premier affichage.
  mobileMq = window.matchMedia('(max-width: 1023.98px)')
  syncIsMobile()
  mobileMq.addEventListener('change', syncIsMobile)
  if (isMobile.value && geo.consent.value === 'undecided') {
    sheetState.value = 'collapsed'
  }
  const saved = geo.savedQuery.value
  if (saved && saved.q) {
    searchByQuery(saved.q)
  }
})

onBeforeUnmount(() => {
  mobileMq?.removeEventListener('change', syncIsMobile)
  mobileMq = null
})

function searchNow(query: string) {
  searchByQuery(query)
}

function retry() {
  if (reco.lastSearch.value) {
    run(reco.lastSearch.value, appliedLocation.value?.label ?? '', appliedLocation.value?.mode ?? 'query')
  }
}

function widenRadius(value: number) {
  prefs.selectRadius(value)
  if (reco.lastSearch.value) {
    const base = reco.lastSearch.value
    const request: RecommendationRequest = { ...base, radius: value }
    run(request, appliedLocation.value?.label ?? '', appliedLocation.value?.mode ?? 'query')
  }
}

function changeFuel(value: (typeof FUEL_OPTIONS)[number]['value']) {
  prefs.selectFuel(value)
  // On ne relance pas ici : l'utilisateur relance ensuite via « Recalculer »
  // ou une nouvelle recherche. Le carburant est mémorisé (CAR-2).
}

function changeRadius(value: number) {
  prefs.selectRadius(value)
}

// ——— Consommation du lastSearch pour un bouton « Recalculer avec ce carburant » ———
function reloadWithFuel() {
  if (reco.lastSearch.value) {
    const base = reco.lastSearch.value
    const request: RecommendationRequest = { ...base, fuel: prefs.fuel.value, radius: prefs.radius.value }
    run(request, appliedLocation.value?.label ?? '', appliedLocation.value?.mode ?? 'query')
  }
}

function reloadWithRadius() {
  if (reco.lastSearch.value) {
    const base = reco.lastSearch.value
    const request: RecommendationRequest = { ...base, fuel: prefs.fuel.value, radius: prefs.radius.value }
    run(request, appliedLocation.value?.label ?? '', appliedLocation.value?.mode ?? 'query')
  }
}

const radiusLabel = computed(() => `${prefs.radius.value} km`)

const stationsData = computed(() => stations.state.value.data)
const loading = computed(() => reco.state.value.status === 'loading')
const hasRecommendation = computed(
  () => reco.state.value.status === 'success' && reco.state.value.data !== null
)
const hasInsufficient = computed(
  () => reco.state.value.status === 'empty' && reco.state.value.data !== null
)
const hasError = computed(() => reco.state.value.status === 'error')
const recommendedStationId = computed(() => reco.state.value.data?.recommendedStation?.id ?? null)

// ——— Compteur « ⛽ N stations » : toujours le nombre RÉEL de stations
// retournées par la recherche en cours — jamais un nombre inventé
// (CONTEXT.md, invariant « aucun prix/donnée inventée »). ———
const stationCount = computed(() => stationsData.value?.stations.length ?? 0)
const stationCountLabel = computed(() => stationCount.value.toLocaleString('fr-FR'))

// ═══════════════════════ Bottom sheet (résultats + réglages) ═══════════════════════
// Trois états : repliée (poignée + résumé), moyenne (la recommandation),
// étendue (recommandation + liste + réglages). Draggable au doigt (pointer
// events sur la poignée) avec repli sur un simple cycle au clic, et
// utilisable au clavier (poignée focusable, flèches haut/bas, Entrée —
// aria-expanded).
type SheetState = 'collapsed' | 'medium' | 'expanded'
const sheetState = ref<SheetState>('medium')
const handleRef = ref<HTMLButtonElement | null>(null)

// ——— La bannière de consentement (LOC-1) ne doit jamais recouvrir les
// contrôles du haut (header, recherche, carburant) ni passer sous la feuille.
// En mobile (bottom sheet pleine largeur), on ne la montre que si la feuille
// est repliée — c'est l'espace qui lui est dédié. Dès qu'une action de la
// bannière ferme celle-ci, on rouvre la feuille en état « moyen ». ———
const isMobile = ref(false)
let mobileMq: MediaQueryList | null = null
function syncIsMobile() {
  isMobile.value = mobileMq?.matches ?? false
}
const consentBannerVisible = computed(
  () => geo.consent.value === 'undecided' && (!isMobile.value || sheetState.value === 'collapsed')
)

function openSheetAfterConsent() {
  if (sheetState.value === 'collapsed') {
    sheetState.value = 'medium'
  }
}

function acceptGeo() {
  openSheetAfterConsent()
  locate()
}

function refuseGeo() {
  openSheetAfterConsent()
  geo.deny()
}

function dismissGeo() {
  openSheetAfterConsent()
}

let dragStartY = 0
let dragged = false
const DRAG_THRESHOLD = 32

function onHandlePointerDown(event: PointerEvent) {
  dragStartY = event.clientY
  dragged = false
  handleRef.value?.setPointerCapture(event.pointerId)
}

function onHandlePointerMove(event: PointerEvent) {
  if (event.buttons === 0) return
  if (Math.abs(event.clientY - dragStartY) > 8) {
    dragged = true
  }
}

function onHandlePointerUp(event: PointerEvent) {
  if (!dragged) return
  const delta = event.clientY - dragStartY
  if (delta > DRAG_THRESHOLD) {
    sheetState.value = sheetState.value === 'expanded' ? 'medium' : 'collapsed'
  } else if (delta < -DRAG_THRESHOLD) {
    sheetState.value = sheetState.value === 'collapsed' ? 'medium' : 'expanded'
  }
}

function cycleSheet() {
  sheetState.value =
    sheetState.value === 'collapsed' ? 'medium' : sheetState.value === 'medium' ? 'expanded' : 'collapsed'
}

function onHandleClick() {
  // Un clic/tap qui suit un drag a déjà été traité par onHandlePointerUp.
  if (dragged) {
    dragged = false
    return
  }
  cycleSheet()
}

function onHandleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    sheetState.value = sheetState.value === 'collapsed' ? 'medium' : 'expanded'
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    sheetState.value = sheetState.value === 'expanded' ? 'medium' : 'collapsed'
  }
  // Entrée / Espace : laissés au comportement natif du <button> (déclenche @click).
}

const sheetSummary = computed(() => {
  if (loading.value) return 'Recherche en cours…'
  if (hasError.value) return 'Recommandation indisponible'
  if (hasInsufficient.value) return 'Données insuffisantes'
  if (hasRecommendation.value) {
    return stationCount.value > 0
      ? `${stationCountLabel.value} station${stationCount.value > 1 ? 's' : ''} — voir la recommandation`
      : 'Voir la recommandation'
  }
  return 'Choisissez une position pour voir la recommandation'
})

// ——— Hauteur actuellement occupée par la feuille (mobile) : la carte et les
// overlays bas doivent rester AU-DESSUS de la feuille, jamais dessous (sinon
// marqueurs et FAB sont invisibles, cachés par la feuille opaque). Exposé en
// variable CSS ; ignoré en desktop où la feuille est un panneau latéral qui
// ne recouvre pas le bas de la carte (voir <style> ci-dessous). ———
const sheetPeek = computed(() => {
  if (sheetState.value === 'collapsed') return '4.6rem'
  if (sheetState.value === 'medium') return 'min(52dvh, 30rem)'
  return 'min(88dvh, calc(100dvh - var(--header-h) - 0.5rem))'
})

// ——— Légende/compteur et FAB masqués quand la feuille étendue les recouvre :
// uniquement sur mobile (bottom sheet pleine largeur). En desktop le panneau
// latéral ne recouvre pas le bas de la carte, on les garde visibles. ———
const bottomOverlaysHidden = computed(() => isMobile.value && sheetState.value === 'expanded')
</script>

<template>
  <main id="main" class="map-page" :style="{ '--sheet-peek': sheetPeek }">
    <h1 class="sr-only">Je fais le plein ou non&nbsp;?</h1>
    <p class="sr-only">
      Une réponse simple et explicable, à partir des prix officiels des carburants.
    </p>

    <StationMap
      class="map-layer"
      :result="stationsData"
      :recommended-station-id="recommendedStationId"
    />

    <!-- Overlay haut : recherche + carburant -->
    <div class="map-overlay map-overlay-top">
      <LocationSearch class="map-search" @search="searchNow" />
      <FuelSelector
        class="map-fuel"
        :model-value="prefs.fuel.value"
        :options="FUEL_OPTIONS"
        @update:model-value="changeFuel"
      />
      <p v-if="searchMessage" class="map-message pill pill-raised" role="status">{{ searchMessage }}</p>
      <p
        v-else-if="geo.geolocationError.value"
        class="map-message pill pill-raised"
        role="status"
      >
        {{ geo.geolocationError.value }}
      </p>
    </div>

    <!-- Overlay bas-gauche : légende + compteur réel de stations. Masqué
         quand la feuille est étendue (elle recouvrirait cette zone). -->
    <div v-show="!bottomOverlaysHidden" class="map-overlay map-overlay-legend">
      <div class="overlay-card map-legend">
        <p class="map-legend-row"><span class="badge-dot" style="color: var(--marker-rupture)" />Prix périmé</p>
      </div>
      <p class="pill pill-raised map-counter" role="status">
        ⛽ {{ stationCountLabel }} station{{ stationCount > 1 ? 's' : '' }}
      </p>
      <p v-if="stationsData" class="map-attribution" role="note">
        {{ OSM_ATTRIBUTION_NOTE }}{{ stationsData.attribution?.source ? ' — ' + stationsData.attribution.source : '' }}
      </p>
    </div>

    <!-- Overlay bas-droite : FAB de recentrage (les contrôles de zoom Leaflet
         se posent dans le même coin, voir components/StationMap.vue). Masqué
         quand la feuille est étendue, pour la même raison que la légende. -->
    <div v-show="!bottomOverlaysHidden" class="map-overlay map-overlay-fabs">
      <button
        type="button"
        class="fab fab-accent"
        :disabled="geo.locating.value"
        aria-label="Recentrer sur ma position"
        title="Recentrer sur ma position"
        @click="locate"
      >
        {{ geo.locating.value ? '…' : '◎' }}
      </button>
    </div>

    <GeoConsentBanner
      v-if="consentBannerVisible"
      :locating="geo.locating.value"
      @accept="acceptGeo"
      @refuse="refuseGeo"
      @dismiss="dismissGeo"
    />

    <!-- Bottom sheet : recommandation, liste des stations, réglages -->
    <section class="sheet" :class="`sheet-${sheetState}`" aria-label="Résultats et réglages">
      <button
        ref="handleRef"
        type="button"
        class="sheet-handle"
        :aria-expanded="sheetState !== 'collapsed'"
        aria-controls="sheet-body"
        @click="onHandleClick"
        @keydown="onHandleKeydown"
        @pointerdown="onHandlePointerDown"
        @pointermove="onHandlePointerMove"
        @pointerup="onHandlePointerUp"
      >
        <span class="sheet-handle-bar" aria-hidden="true" />
        <span class="sheet-handle-summary">{{ sheetSummary }}</span>
      </button>

      <div id="sheet-body" class="sheet-body">
        <section class="reco-area" aria-live="polite" :aria-busy="loading ? 'true' : 'false'">
          <RecommendationLoading v-if="loading" />
          <RecommendationError
            v-else-if="hasError"
            :message="reco.state.value.error ?? 'Erreur inconnue.'"
            @retry="retry"
          />
          <RecommendationInsufficient
            v-else-if="hasInsufficient"
            :recommendation="reco.state.value.data!"
            @widen-radius="widenRadius"
          />
          <RecommendationCard v-else-if="hasRecommendation" :recommendation="reco.state.value.data!" />
          <p v-else class="reco-idle">
            Choisissez une position (bouton de recentrage « ◎ ») ou une ville /
            un code postal pour obtenir une recommandation.
          </p>
          <p v-if="appliedLocation" class="reco-applied">
            {{ appliedLocation.mode === 'geo' ? 'Position utilisée' : 'Recherche autour de' }}&nbsp;:
            {{ appliedLocation.label }}
          </p>
        </section>

        <StationList
          v-if="stationsRequest"
          :request="stationsRequest"
          :recommended-station-id="recommendedStationId"
          class="sheet-station-list"
        />

        <section class="sheet-settings">
          <h2 class="sheet-settings-title">Réglages</h2>
          <RadiusSelector
            :model-value="prefs.radius.value"
            :options="[...RADIUS_OPTIONS]"
            @update:model-value="changeRadius"
          />
          <div v-if="reco.lastSearch.value" class="reload-actions">
            <button type="button" class="btn btn-secondary" @click="reloadWithFuel">
              Recalculer avec {{ prefs.fuel.value }}
            </button>
            <button type="button" class="btn btn-secondary" @click="reloadWithRadius">
              Recalculer avec {{ radiusLabel }}
            </button>
          </div>
        </section>

        <p class="page-foot">
          Prix officiels DGCCRF mis à jour périodiquement. Aucune tendance n’est
          présentée comme certaine.
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.map-page {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.map-layer {
  position: absolute;
  inset: 0;
}
/* La zone vivante de la carte s'arrête au-dessus de la feuille (mobile) :
   Leaflet centre sur SON conteneur, donc si la carte remplissait tout le
   viewport, le point recherché finirait sous la feuille, invisible. En
   desktop la feuille est un panneau latéral qui ne recouvre pas le bas de
   la carte : pas de découpe nécessaire. */
@media (max-width: 1023.98px) {
  .map-layer {
    bottom: calc(var(--nav-h) + var(--sheet-peek));
  }
}

/* ═══════════════════ Overlays flottants ═══════════════════ */
.map-overlay {
  position: absolute;
  left: 0;
  right: 0;
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 0.75rem;
  pointer-events: none;
}
.map-overlay > * {
  pointer-events: auto;
}

.map-overlay-top {
  top: calc(var(--header-h) + 0.5rem);
  align-items: stretch;
}
.map-search {
  max-width: 30rem;
}
.map-fuel {
  max-width: 100%;
}
.map-message {
  align-self: flex-start;
  color: var(--negative);
}

.map-overlay-legend {
  left: 0.75rem;
  right: auto;
  bottom: calc(var(--nav-h) + var(--sheet-peek) + 0.75rem);
  align-items: flex-start;
  width: max-content;
  max-width: calc(100vw - 1.5rem);
}
.map-legend {
  display: grid;
  gap: 0.3rem;
}
.map-legend-row {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--text-900);
}
.map-counter {
  align-self: flex-start;
}
.map-attribution {
  margin: 0;
  max-width: 15rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--text-700);
  background: var(--surface);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
}

.map-overlay-fabs {
  left: auto;
  right: 0.75rem;
  bottom: calc(var(--nav-h) + var(--sheet-peek) + 0.75rem);
  align-items: flex-end;
  width: max-content;
}

/* ═══════════════════════════ Bottom sheet ═══════════════════════════ */
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--nav-h);
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  box-shadow: var(--shadow-lg);
  max-height: calc(100dvh - var(--header-h) - var(--nav-h) - 1rem);
  transition: height 0.22s ease;
}

.sheet-handle {
  display: grid;
  gap: 0.35rem;
  justify-items: center;
  padding: 0.6rem 1rem 0.75rem;
  border: none;
  background: none;
  font-family: inherit;
  cursor: grab;
  flex: none;
  touch-action: none;
}
.sheet-handle-bar {
  width: 40px;
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--border-strong);
}
.sheet-handle-summary {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-700);
}

.sheet-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 1.1rem 1.5rem;
  display: grid;
  gap: 1.1rem;
}

.reco-area {
  display: grid;
  gap: 0.5rem;
}
.reco-idle {
  margin: 0;
  padding: 0.9rem 1rem;
  border-radius: var(--r-md);
  background: var(--slate-100);
  color: var(--text-700);
  font-size: 0.95rem;
}
.reco-applied {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-700);
}

.sheet-station-list {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}

.sheet-settings {
  display: grid;
  gap: 0.6rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.sheet-settings-title {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-700);
}
.reload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.page-foot {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-500);
  text-align: center;
}

/* Hauteurs par état, mobile : la feuille est ancrée en bas, sur toute la
   largeur. */
.sheet-collapsed {
  height: 4.6rem;
}
.sheet-collapsed .sheet-body {
  display: none;
}
.sheet-medium {
  height: min(52dvh, 30rem);
}
.sheet-expanded {
  height: min(88dvh, calc(100dvh - var(--header-h) - 0.5rem));
}

/* ═══════════════════ Desktop (≥ 1024 px) ═══════════════════
   Même composition : overlays flottants centrés en haut, mais la bottom
   sheet devient un panneau latéral gauche flottant en .overlay-card. */
@media (min-width: 1024px) {
  .map-overlay-top {
    align-items: center;
  }
  .map-search {
    width: 26rem;
  }

  .sheet {
    left: 1.25rem;
    right: auto;
    top: calc(var(--header-h) + 5.5rem);
    bottom: calc(var(--nav-h) + 1.5rem);
    width: 23rem;
    max-height: none;
    height: auto;
    border-radius: var(--r-xl);
  }
  .sheet-collapsed {
    height: 4.6rem;
  }
  /* Le panneau desktop a assez de hauteur pour tout montrer d'un coup : la
     distinction repliée/étendue n'a d'utilité que sur mobile (bottom sheet
     à hauteur contrainte). */
  .sheet-medium,
  .sheet-expanded {
    height: 100%;
  }

  .map-overlay-legend,
  .map-overlay-fabs {
    /* Le panneau latéral ne recouvre pas le bas de la carte : pas besoin de
       remonter au-dessus de --sheet-peek comme sur mobile. */
    bottom: calc(var(--nav-h) + 0.75rem);
  }
  .map-overlay-legend {
    left: calc(1.25rem + 23rem + 1rem);
  }
}
</style>
