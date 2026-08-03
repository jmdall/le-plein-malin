<script setup lang="ts">
// StationCard — Carte d'une station de la liste (ticket 011, spec §5.3 STA-1).
// Affiche : nom, enseigne si disponible, adresse, ville, distance, carburant,
// prix, date/heure de mise à jour, âge de la donnée, économie brute, coût du
// détour, économie nette et bouton « Itinéraire » (OSM). Les valeurs viennent
// du serveur (jamais recalculées, REC-2/D1). Badge de fraîcheur accessible :
// le texte porte l'information, la couleur est un renfort (NFR-ACC-4).
import { computed } from 'vue'
import {
  formatPrice,
  formatCurrency,
  formatDistance,
  formatUpdatedAt,
  formatAgeLabel
} from '../utils/format'
import { fuelFromApi, fuelOptionFor } from '../utils/fuel'
import { buildDirectionsUrl } from '../utils/location'
import {
  FRESHNESS_LABELS,
  type ListedStation
} from '../utils/stations'
import FuelBadge from './FuelBadge.vue'

const props = defineProps<{
  station: ListedStation
  isFavorite: boolean
}>()

const emit = defineEmits<{
  toggleFavorite: [id: string]
}>()

const fuelLabel = computed(() => fuelOptionFor(fuelFromApi(props.station.fuel)).label)
const brandLabel = computed(() => props.station.brand?.trim() || null)
const distanceLabel = computed(() => formatDistance(props.station.distanceKm))
const priceLabel = computed(() => formatPrice(props.station.price))
const updatedAtDate = computed(() => new Date(props.station.updatedAt))
const updatedAtLabel = computed(() => formatUpdatedAt(updatedAtDate.value))
const ageLabel = computed(() => formatAgeLabel(props.station.freshness.ageInHours))
const freshnessStatus = computed(() => props.station.freshness.status)
const freshnessLabel = computed(() => FRESHNESS_LABELS[props.station.freshness.status])
const netSavings = computed(() => props.station.economics.netSavings)
const grossSavings = computed(() => props.station.economics.grossSavings)
const detourCost = computed(() => props.station.economics.detourCost)
const hasEconomics = computed(() => netSavings.value !== null && grossSavings.value !== null && detourCost.value !== null)
const directionsUrl = computed(() => buildDirectionsUrl(props.station.position))
const favoriteLabel = computed(() => (props.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'))
</script>

<template>
  <article
    class="station-card"
    :class="{
      'is-stale': freshnessStatus === 'stale',
      'is-obsolete': freshnessStatus === 'obsolete',
      'is-reference': station.isReference
    }"
    :data-freshness="freshnessStatus"
  >
    <header class="station-header">
      <h3 class="station-name">
        {{ station.name }}
        <FuelBadge v-if="fuelLabel" :fuel="fuelLabel" />
      </h3>
      <button
        type="button"
        class="favorite-btn"
        :class="{ active: isFavorite }"
        :aria-pressed="isFavorite"
        :aria-label="favoriteLabel + ' — ' + station.name"
        @click="emit('toggleFavorite', station.id)"
      >
        <span class="favorite-star" aria-hidden="true">{{ isFavorite ? '★' : '☆' }}</span>
        <span class="favorite-text sr-only">{{ favoriteLabel }}</span>
      </button>
    </header>

    <p v-if="brandLabel" class="station-brand">{{ brandLabel }}</p>

    <address class="station-address">
      {{ station.address }}{{ station.city ? ' — ' + station.city : '' }}
    </address>

    <dl class="station-meta">
      <div class="meta-item">
        <dt>Distance</dt>
        <dd>{{ distanceLabel }}</dd>
      </div>
      <div class="meta-item">
        <dt>Prix</dt>
        <dd class="meta-price" data-testid="station-price">{{ priceLabel }}</dd>
      </div>
    </dl>

    <p class="station-freshness" :data-freshness="freshnessStatus" data-testid="station-freshness">
      <span class="freshness-dot" aria-hidden="true" />
      <span>{{ freshnessLabel }}</span>
      <span v-if="updatedAtDate" class="station-updated">
        — mis à jour le {{ updatedAtLabel }}
      </span>
      <span v-if="ageLabel"> ({{ ageLabel }})</span>
    </p>

    <dl v-if="hasEconomics" class="station-economics">
      <div class="eco-item">
        <dt>Économie brute</dt>
        <dd>{{ formatCurrency(grossSavings!) }}</dd>
      </div>
      <div class="eco-item">
        <dt>Coût du détour</dt>
        <dd>{{ formatCurrency(detourCost!) }}</dd>
      </div>
      <div class="eco-item eco-net">
        <dt>Économie nette</dt>
        <dd data-testid="station-net-savings">
          <strong :class="{ positive: (netSavings ?? 0) >= 0 }">{{ formatCurrency(netSavings!) }}</strong>
        </dd>
      </div>
    </dl>
    <p v-else-if="station.isReference" class="station-reference-note" role="note">
      Station de référence : point de comparaison des prix.
    </p>
    <p v-else-if="freshnessStatus === 'obsolete'" class="station-reference-note" role="note">
      Prix trop ancien : non pris en compte dans les recommandations.
    </p>

    <a
      :href="directionsUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-secondary station-directions"
    >
      Itinéraire
    </a>
  </article>
</template>

<style scoped>
.station-card {
  display: grid;
  gap: 0.5rem;
  padding: 0.95rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
  box-shadow: var(--shadow-soft);
}
.station-card.is-stale {
  opacity: 0.82;
}
.station-card.is-reference {
  border-style: dashed;
}
.station-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.station-name {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  font-size: 1.02rem;
  line-height: 1.3;
}
.favorite-btn {
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.15rem;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
.favorite-btn:hover {
  background: var(--surface-raised);
}
.favorite-btn.active {
  color: #b45309;
  border-color: #f59e0b;
  background: #fffbeb;
}
.station-brand {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}
.station-address {
  margin: 0;
  font-style: normal;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.station-meta {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.meta-item {
  display: grid;
  gap: 0.1rem;
}
.meta-item dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}
.meta-item dd {
  margin: 0;
  font-size: 0.95rem;
}
.meta-price {
  font-weight: 700;
  font-size: 1.15rem !important;
}
.station-freshness {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.station-freshness[data-freshness='stale'] {
  color: #92400e;
}
.station-freshness[data-freshness='obsolete'] {
  color: #991b1b;
  font-weight: 600;
}
.station-updated {
  color: var(--text-muted);
}
.freshness-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  display: inline-block;
  background: #22c55e;
}
.station-freshness[data-freshness='stale'] .freshness-dot {
  background: #f59e0b;
}
.station-freshness[data-freshness='obsolete'] .freshness-dot {
  background: #ef4444;
}
.station-economics {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  padding: 0.55rem 0.7rem;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  background: var(--surface-raised);
}
.eco-item {
  display: grid;
  gap: 0.1rem;
}
.eco-item dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}
.eco-item dd {
  margin: 0;
  font-size: 0.95rem;
}
.eco-net {
  grid-column: 1 / -1;
}
.eco-net strong.positive {
  color: var(--positive);
}
.station-reference-note {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.station-directions {
  justify-self: start;
}

@media (max-width: 420px) {
  .station-economics {
    grid-template-columns: 1fr;
  }
  .eco-net {
    grid-column: 1;
  }
}

@media (prefers-color-scheme: dark) {
  html.dark .favorite-btn.active {
    color: #fbbf24;
    background: #451a03;
    border-color: #b45309;
  }
  html.dark .station-freshness[data-freshness='stale'] {
    color: #fbbf24;
  }
  html.dark .station-freshness[data-freshness='obsolete'] {
    color: #fca5a5;
  }
}
</style>
