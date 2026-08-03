<script setup lang="ts">
// RecommendationCard — Carte principale de la recommandation (ticket 010).
// Affiche exactement les champs fournis par le module via l'API (REC-2/D1) :
// type, confiance, station conseillée, prix, date de mise à jour, économie
// nette, explication synthétique, fraîcheur, isPartial ; boutons « Voir le
// calcul » (panneau dépliable) et « Itinéraire » (OSM, spec §4 #7).
// Aucune règle métier n'est recalculée ici.
import { computed, ref } from 'vue'
import {
  RECOMMENDATION_TITLES,
  confidenceLabel,
  type Recommendation
} from '../utils/recommendation'
import {
  formatPrice,
  formatCurrency,
  formatQuantity,
  formatUpdatedAt,
  formatAgeLabel
} from '../utils/format'
import { fuelFromApi, fuelOptionFor } from '../utils/fuel'
import { buildDirectionsUrl } from '../utils/location'
import FuelBadge from './FuelBadge.vue'

const props = defineProps<{
  recommendation: Recommendation
}>()

const panelOpen = ref(false)

const title = computed(() => RECOMMENDATION_TITLES[props.recommendation.type] ?? props.recommendation.type)
const confidence = computed(() => confidenceLabel(props.recommendation.confidence))
const station = computed(() => props.recommendation.recommendedStation)
const stationName = computed(() => station.value?.name ?? props.recommendation.referenceStation?.name ?? '—')
const stationCity = computed(() => station.value?.city ?? props.recommendation.referenceStation?.city ?? '')
const price = computed(() => station.value?.price ?? props.recommendation.referenceStation?.price)
const updatedAt = computed(() =>
  station.value ? new Date(station.value.updatedAt) : props.recommendation.referenceStation ? new Date(props.recommendation.referenceStation.updatedAt) : null
)
const freshnessStatus = computed(() => props.recommendation.freshness?.status)
const ageLabel = computed(() =>
  props.recommendation.freshness ? formatAgeLabel(props.recommendation.freshness.ageInHours) : ''
)
const netSavings = computed(() => props.recommendation.netSavings)
const grossSavings = computed(() => props.recommendation.grossSavings)
const detourCost = computed(() => props.recommendation.detourCost)
const quantity = computed(() => props.recommendation.quantityToBuy)
const isPartial = computed(() => props.recommendation.isPartial)
const directionsUrl = computed(() =>
  station.value ? buildDirectionsUrl(station.value.position) : null
)
const fuelLabel = computed(() => fuelOptionFor(fuelFromApi(station.value?.fuel)).label)
const confidencePercent = computed(() => Math.round(props.recommendation.confidence * 100))

const freshnessStatusLabel = computed(() => {
  switch (freshnessStatus.value) {
    case 'fresh':
      return 'Donnée fraîche'
    case 'stale':
      return 'Donnée potentiellement obsolète'
    case 'obsolete':
      return 'Donnée obsolète'
    default:
      return ''
  }
})

const showStationSection = computed(
  () =>
    props.recommendation.type === 'go-to-station' ||
    props.recommendation.type === 'fill-now' ||
    props.recommendation.type === 'partial-fill' ||
    props.recommendation.type === 'wait'
)

function togglePanel() {
  panelOpen.value = !panelOpen.value
}
</script>

<template>
  <article class="recommendation-card" :class="`type-${recommendation.type}`">
    <header class="rec-header">
      <h2 class="rec-title">{{ title }}</h2>
      <p class="rec-confidence" :aria-label="`Niveau de confiance ${confidencePercent} %`">
        Confiance <strong>{{ confidence }}</strong> ({{ confidencePercent }} %)
      </p>
      <p v-if="isPartial" class="rec-partial" role="note">
        Recommandation partielle : certaines données manquent.
      </p>
    </header>

    <section v-if="showStationSection" class="rec-station" aria-label="Station conseillée">
      <p class="rec-station-name">
        {{ stationName }}
        <FuelBadge v-if="fuelLabel" :fuel="fuelLabel" />
      </p>
      <p v-if="stationCity" class="rec-station-city">{{ stationCity }}</p>
      <p v-if="price !== undefined && price !== null" class="rec-price">
        {{ formatPrice(price) }}
      </p>
      <p v-if="quantity !== null && quantity !== undefined" class="rec-quantity">
        Volume conseillé : {{ formatQuantity(quantity) }}
      </p>
      <p v-if="netSavings !== null && netSavings !== undefined" class="rec-savings" data-testid="net-savings">
        Économie nette : <strong>{{ formatCurrency(netSavings) }}</strong>
      </p>
      <p v-else-if="grossSavings !== null && grossSavings !== undefined" class="rec-savings" data-testid="gross-savings">
        Économie brute : <strong>{{ formatCurrency(grossSavings) }}</strong>
      </p>
      <p v-if="detourCost !== null && detourCost !== undefined" class="rec-detour-cost">
        Coût du détour : {{ formatCurrency(detourCost) }}
      </p>
    </section>

    <section v-if="recommendation.reasons && recommendation.reasons.length > 0" class="rec-reasons" aria-label="Explication">
      <ul class="rec-reasons-list">
        <li v-for="(reason, i) in recommendation.reasons" :key="i" class="rec-reason">
          {{ reason }}
        </li>
      </ul>
    </section>

    <footer class="rec-footer">
      <p class="rec-freshness">
        <span class="freshness-dot" :data-status="freshnessStatus" aria-hidden="true" />
        {{ freshnessStatusLabel }}
        <span v-if="updatedAt" class="rec-updated" data-testid="rec-updated">
          Mis à jour le {{ formatUpdatedAt(updatedAt) }}
        </span>
        <span v-if="ageLabel"> — {{ ageLabel }}</span>
      </p>

      <div class="rec-actions">
        <a
          v-if="directionsUrl"
          :href="directionsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-secondary"
        >
          Itinéraire
        </a>
        <button type="button" class="btn btn-ghost" :aria-expanded="panelOpen" @click="togglePanel">
          Voir le calcul
        </button>
      </div>
    </footer>

    <section v-if="panelOpen" class="rec-panel" data-testid="calc-panel" aria-label="Détail du calcul">
      <h3 class="panel-title">Détail du calcul</h3>

      <div v-if="recommendation.usedData.length > 0" class="panel-block">
        <h4 class="panel-subtitle">Données utilisées</h4>
        <ul class="panel-list">
          <li v-for="(d, i) in recommendation.usedData" :key="`used-${i}`">{{ d }}</li>
        </ul>
      </div>

      <div v-if="recommendation.ignoredData.length > 0" class="panel-block">
        <h4 class="panel-subtitle">Données ignorées</h4>
        <ul class="panel-list">
          <li v-for="(d, i) in recommendation.ignoredData" :key="`ign-${i}`">{{ d }}</li>
        </ul>
      </div>

      <div v-if="recommendation.calculations.length > 0" class="panel-block">
        <h4 class="panel-subtitle">Calculs effectués</h4>
        <ul class="panel-list">
          <li v-for="(d, i) in recommendation.calculations" :key="`calc-${i}`">{{ d }}</li>
        </ul>
      </div>

      <div v-if="recommendation.assumptions.length > 0" class="panel-block">
        <h4 class="panel-subtitle">Hypothèses</h4>
        <ul class="panel-list">
          <li v-for="(d, i) in recommendation.assumptions" :key="`ass-${i}`">{{ d }}</li>
        </ul>
      </div>

      <div class="panel-block">
        <h4 class="panel-subtitle">Fraîcheur des données</h4>
        <ul class="panel-list">
          <li>
            {{ freshnessStatusLabel }} ({{ ageLabel }}) — score {{ Math.round(recommendation.freshness.score * 100) }}/100
          </li>
        </ul>
      </div>

      <p v-if="isPartial" class="panel-note">
        Cette recommandation est partielle : certains paramètres (tendance,
        géolocalisation, profil véhicule) ne sont pas entièrement disponibles.
      </p>
    </section>
  </article>
</template>

<style scoped>
.recommendation-card {
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  background: var(--surface);
  box-shadow: var(--shadow-soft);
}
.rec-header {
  display: grid;
  gap: 0.3rem;
}
.rec-title {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.25;
}
.rec-confidence {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.rec-partial {
  margin: 0;
  font-size: 0.85rem;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
}
.rec-station {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px dashed var(--border);
  border-radius: 0.6rem;
  background: var(--surface-raised);
}
.rec-station-name {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
}
.rec-station-city {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.rec-price {
  margin: 0.35rem 0 0;
  font-size: 1.6rem;
  font-weight: 700;
}
.rec-quantity,
.rec-savings,
.rec-detour-cost {
  margin: 0;
  font-size: 0.95rem;
}
.rec-savings strong {
  color: var(--positive);
}
.rec-reasons {
  margin: 0;
}
.rec-reasons-list {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.3rem;
}
.rec-reason {
  font-size: 0.95rem;
  line-height: 1.45;
}
.rec-footer {
  display: grid;
  gap: 0.6rem;
}
.rec-freshness {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.freshness-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  display: inline-block;
}
.freshness-dot[data-status='fresh'] {
  background: #22c55e;
}
.freshness-dot[data-status='stale'] {
  background: #f59e0b;
}
.freshness-dot[data-status='obsolete'] {
  background: #ef4444;
}
.rec-updated {
  color: var(--text-muted);
}
.rec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.rec-panel {
  display: grid;
  gap: 0.8rem;
  border-top: 1px solid var(--border);
  padding-top: 0.9rem;
}
.panel-title {
  margin: 0;
  font-size: 1rem;
}
.panel-block {
  display: grid;
  gap: 0.3rem;
}
.panel-subtitle {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}
.panel-list {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.25rem;
  font-size: 0.9rem;
  line-height: 1.45;
}
.panel-note {
  margin: 0;
  font-size: 0.85rem;
  color: #b45309;
}

@media (prefers-color-scheme: dark) {
  html.dark .rec-partial {
    color: #fbbf24;
    background: #451a03;
    border-color: #92400e;
  }
  html.dark .panel-note {
    color: #fbbf24;
  }
}
</style>
