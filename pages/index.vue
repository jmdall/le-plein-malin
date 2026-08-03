<script setup lang="ts">
// pages/index.vue — Page principale « Je fais le plein ou non ? » (ticket 010).
// Parcours spec §4 : bannière de consentement géoloc (non bloquante, LOC-1),
// rayon (5/10/20/30, défaut 10, LOC-3) et carburant préféré (CAR-2) mémorisés
// localement, recherche ville/CP sans géolocalisation (LOC-2). Affichage
// immédiat de la recommandation fournie par l'API (009) — l'UI ne recalculera
// jamais les règles (REC-2/D1). États : chargement, erreur, données
// insuffisantes, fraîcheur > 24 h atténuée.
import { computed, onMounted, ref } from 'vue'
import { useHead } from '#imports'
import { FUEL_OPTIONS } from '../utils/fuel'
import { usePreferences, RADIUS_OPTIONS } from '../composables/usePreferences'
import { useGeolocation } from '../composables/useGeolocation'
import { useFuelRecommendation } from '../composables/useFuelRecommendation'
import { useStations } from '../composables/useStations'
import { saveLocation } from '../utils/location'
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

// ——— Bouton « Utiliser ma position » ———
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
  const saved = geo.savedQuery.value
  if (saved && saved.q) {
    searchByQuery(saved.q)
  }
})

function acceptGeo() {
  locate()
}

function refuseGeo() {
  geo.deny()
}

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

// ——— Réactions aux changements carburant / rayon ———
const fuelChangeToken = ref(0)
const radiusChangeToken = ref(0)

function changeFuel(value: (typeof FUEL_OPTIONS)[number]['value']) {
  prefs.selectFuel(value)
  fuelChangeToken.value++
  // On ne relance pas ici : l'utilisateur clique ensuite « Rechercher » ou
  // « Utiliser ma position ». Le carburant est mémorisé (CAR-2).
}

function changeRadius(value: number) {
  prefs.selectRadius(value)
  radiusChangeToken.value++
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
</script>

<template>
  <main id="main" class="page">
    <header class="page-header">
      <h1 class="page-title">Je fais le plein ou non&nbsp;?</h1>
      <p class="page-tagline">
        Une réponse simple et explicable, à partir des prix officiels des carburants.
      </p>
    </header>

    <section id="localisation" class="geo-controls" aria-label="Localisation">
      <GeoConsentBanner v-if="geo.consent.value === 'undecided'" :locating="geo.locating.value" @accept="acceptGeo" @refuse="refuseGeo" />

      <div v-if="geo.consent.value !== 'undecided'" class="geo-actions">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="geo.locating.value"
          @click="locate"
        >
          {{ geo.locating.value ? 'Localisation…' : 'Utiliser ma position' }}
        </button>
        <span v-if="geo.geolocationError.value" class="geo-error" role="status">{{ geo.geolocationError.value }}</span>
        <span v-else-if="appliedLocation && appliedLocation.mode === 'geo'" class="geo-applied">
          Position utilisée&nbsp;: {{ appliedLocation.label }}
        </span>
      </div>

      <LocationSearch class="location-search" @search="searchNow" />
      <p v-if="searchMessage" class="geo-error" role="status">{{ searchMessage }}</p>
      <p v-else-if="appliedLocation && appliedLocation.mode === 'query'" class="geo-applied">
        Recherche autour de&nbsp;: {{ appliedLocation.label }}
      </p>
    </section>

    <section class="prefs-controls" aria-label="Carburant et rayon">
      <FuelSelector
        :model-value="prefs.fuel.value"
        :options="FUEL_OPTIONS"
        @update:model-value="changeFuel"
      />
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

    <section class="reco-area" aria-live="polite" :aria-busy="loading ? 'true' : 'false'">
      <RecommendationLoading v-if="loading" />

      <RecommendationError v-else-if="hasError" :message="reco.state.value.error ?? 'Erreur inconnue.'" @retry="retry" />

      <RecommendationInsufficient v-else-if="hasInsufficient" :recommendation="reco.state.value.data!" @widen-radius="widenRadius" />

      <RecommendationCard v-else-if="hasRecommendation" :recommendation="reco.state.value.data!" />

      <p v-else class="reco-idle">
        Choisissez une position (bouton « Utiliser ma position ») ou une ville /
        un code postal pour obtenir une recommandation.
      </p>
    </section>

    <StationList
      v-if="stationsRequest"
      :request="stationsRequest"
      class="stations-area"
    />

    <StationMap
      v-if="stationsRequest"
      :result="stationsData"
      class="stations-area"
    />

    <p class="page-foot">
      Prix officiels DGCCRF mis à jour périodiquement. Aucune tendance n’est
      présentée comme certaine.
    </p>
  </main>
</template>
