<script setup lang="ts">
// RecommendationCard — Carte principale de la recommandation (ticket 010).
// Affiche exactement les champs fournis par le module via l'API (REC-2/D1) :
// type, confiance, station conseillée, prix, date de mise à jour, économie
// nette, explication synthétique, fraîcheur, isPartial ; boutons « Voir le
// calcul » (panneau dépliable) et « Itinéraire » (OSM, spec §4 #7).
// Aucune règle métier n'est recalculée ici : la couleur du verdict et du
// montant ne fait que lire le SIGNE de netSavings/grossSavings déjà fourni
// par l'API (vert = favorable, terracotta = défavorable, neutre sinon).
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
import DirectionsLinks from './DirectionsLinks.vue'
import FuelBadge from './FuelBadge.vue'
import BrandBadge from './BrandBadge.vue'

const props = defineProps<{
  recommendation: Recommendation
}>()

const panelOpen = ref(false)

const title = computed(() => RECOMMENDATION_TITLES[props.recommendation.type] ?? props.recommendation.type)
const confidence = computed(() => confidenceLabel(props.recommendation.confidence))
const station = computed(() => props.recommendation.recommendedStation)
// Station effectivement présentée : la recommandée, sinon la station de
// référence (021 §33 — le nom réel de la référence s'affiche aussi en texte).
const displayedStation = computed(() => station.value ?? props.recommendation.referenceStation ?? null)
const stationName = computed(() => displayedStation.value?.name ?? '—')
const stationCity = computed(() => displayedStation.value?.city ?? '')
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
const fuelLabel = computed(() => fuelOptionFor(fuelFromApi(displayedStation.value?.fuel)).label)
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

const freshnessPillClass = computed(() => {
  if (freshnessStatus.value === 'obsolete') return 'pill-terracotta'
  if (freshnessStatus.value === 'stale') return 'pill-muted is-attenuated'
  return 'pill-outline'
})

// Montant mis en avant : l'économie nette prime, l'économie brute ne sert que
// de repli si le serveur n'a pas fourni de net (REC-2/D1, pas de calcul ici).
const amountValue = computed(() => (netSavings.value !== null && netSavings.value !== undefined ? netSavings.value : grossSavings.value))
const amountIsNet = computed(() => netSavings.value !== null && netSavings.value !== undefined)
const amountTone = computed(() => {
  if (amountValue.value === null || amountValue.value === undefined) return 'tone-neutral'
  if (amountValue.value > 0) return 'tone-positive'
  if (amountValue.value < 0) return 'tone-negative'
  return 'tone-neutral'
})

// Pilule de verdict : vert pour toute action favorable (aller à la station,
// plein complet ou partiel), terracotta seulement si la meilleure option
// connue reste en perte nette, neutre chaud sinon (« attendre » sans enjeu).
const verdictPillClass = computed(() => {
  const t = props.recommendation.type
  if (t === 'go-to-station' || t === 'partial-fill' || t === 'fill-now') return 'pill-accent'
  if (netSavings.value !== null && netSavings.value !== undefined && netSavings.value < 0) return 'pill-terracotta'
  return 'pill-muted'
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
  <article class="recommendation-card card" :class="`type-${recommendation.type}`">
    <header class="rec-header">
      <h2 class="rec-title pill" :class="verdictPillClass">{{ title }}</h2>

      <div class="rec-badges">
        <span class="pill pill-outline rec-confidence" :aria-label="`Niveau de confiance ${confidencePercent} %`">
          Confiance {{ confidence }} ({{ confidencePercent }} %)
        </span>
        <span class="pill rec-freshness-pill" :class="freshnessPillClass" :data-status="freshnessStatus">
          <span class="freshness-dot" aria-hidden="true" />
          {{ freshnessStatusLabel }}<span v-if="ageLabel"> · {{ ageLabel }}</span>
        </span>
      </div>

      <p v-if="isPartial" class="rec-partial" role="note">
        Recommandation partielle : certaines données manquent.
      </p>
    </header>

    <div v-if="amountValue !== null && amountValue !== undefined" class="rec-amount" :class="amountTone">
      <span class="rec-amount-label">{{ amountIsNet ? 'Économie nette' : 'Économie brute' }}</span>
      <span class="rec-amount-value tabular-nums" :data-testid="amountIsNet ? 'net-savings' : 'gross-savings'">
        {{ formatCurrency(amountValue) }}
      </span>
      <span v-if="amountIsNet && detourCost !== null && detourCost !== undefined" class="rec-amount-detail">
        détour de {{ formatCurrency(detourCost) }} déjà déduit
      </span>
    </div>

    <section v-if="showStationSection" class="rec-station" aria-label="Station conseillée">
      <p class="rec-station-name">
        {{ stationName }}
        <BrandBadge
          v-if="displayedStation?.brand"
          :brand="displayedStation.brand"
          :logo-url="displayedStation.logoUrl ?? null"
          :name="displayedStation.name"
          size="sm"
        />
        <FuelBadge v-if="fuelLabel" :fuel="fuelLabel" />
      </p>
      <p v-if="stationCity" class="rec-station-city">{{ stationCity }}</p>
      <p v-if="price !== undefined && price !== null" class="rec-price tabular-nums">
        {{ formatPrice(price) }}
      </p>
      <p v-if="quantity !== null && quantity !== undefined" class="rec-quantity tabular-nums">
        Volume conseillé : {{ formatQuantity(quantity) }}
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
      <p v-if="updatedAt" class="rec-updated">
        Mis à jour le <span data-testid="rec-updated">{{ formatUpdatedAt(updatedAt) }}</span>
      </p>

      <div class="rec-actions">
        <DirectionsLinks v-if="directionsUrl" :position="station!.position" />
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
  gap: 0.65rem;
  padding: 0.9rem 1rem;
}
.rec-header {
  display: grid;
  gap: 0.5rem;
}
.rec-title {
  margin: 0;
  align-self: start;
  white-space: normal;
  text-align: center;
  font-size: 1.1rem;
  line-height: 1.25;
  padding: 0.6rem 1.1rem;
}
.rec-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.rec-confidence,
.rec-freshness-pill {
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
}
.rec-freshness-pill.is-attenuated {
  opacity: 0.85;
}
.freshness-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
.rec-partial {
  margin: 0;
  font-size: 0.82rem;
  color: var(--terracotta-strong);
  background: var(--terracotta-bg);
  border-radius: var(--r-md);
  padding: 0.45rem 0.65rem;
}
.rec-amount {
  display: grid;
  gap: 0.1rem;
  padding: 0.7rem 0.85rem;
  border-radius: var(--r-lg);
  background: var(--slate-100);
}
.rec-amount.tone-positive {
  background: var(--accent-bg);
}
.rec-amount.tone-negative {
  background: var(--terracotta-bg);
}
.rec-amount-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-700);
}
.rec-amount-value {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--text-900);
}
.rec-amount.tone-positive .rec-amount-value {
  color: var(--positive);
}
.rec-amount.tone-negative .rec-amount-value {
  color: var(--negative);
}
.rec-amount-detail {
  font-size: 0.78rem;
  color: var(--text-700);
}
.rec-station {
  display: grid;
  gap: 0.2rem;
  padding: 0.6rem 0.7rem;
  border-radius: var(--r-md);
  background: var(--slate-100);
}
.rec-station-name {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
}
.rec-station-city {
  margin: 0;
  color: var(--text-700);
  font-size: 0.85rem;
}
.rec-price {
  margin: 0.15rem 0 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-700);
}
.rec-quantity {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-900);
}
.rec-reasons {
  margin: 0;
}
.rec-reasons-list {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.25rem;
}
.rec-reason {
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--text-700);
}
.rec-footer {
  display: grid;
  gap: 0.5rem;
}
.rec-updated {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-700);
}
.rec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.rec-panel {
  display: grid;
  gap: 0.7rem;
  border-top: 1px solid var(--border);
  padding-top: 0.8rem;
}
.panel-title {
  margin: 0;
  font-size: 0.95rem;
}
.panel-block {
  display: grid;
  gap: 0.25rem;
}
.panel-subtitle {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-700);
}
.panel-list {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.2rem;
  font-size: 0.85rem;
  line-height: 1.4;
}
.panel-note {
  margin: 0;
  font-size: 0.82rem;
  color: var(--terracotta-strong);
}
</style>
