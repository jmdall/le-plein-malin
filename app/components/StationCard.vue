<script setup lang="ts">
// StationCard — Ligne dense de la liste des stations (ticket 011, spec §5.3
// STA-1), pensée pour vivre dans la bottom sheet (hauteur contrainte).
// Affiche : nom, enseigne si disponible, distance, carburant, prix, détour et
// économie nette, fraîcheur (badge si > 24 h), bouton favori et
// « Itinéraire ». Les valeurs viennent du serveur (jamais recalculées,
// REC-2/D1) : seule la COULEUR du prix est dérivée ici, à partir du signe de
// l'économie nette déjà fournie par l'API — aucune recommandation n'est
// recalculée. Les marqueurs de la carte, eux, sont neutres (aucun seuil de
// prix client, REC-2/D1). Badge de fraîcheur accessible : le texte porte
// l'information, la couleur est un renfort (NFR-ACC-4).
import { computed } from 'vue'
import {
  formatPrice,
  formatCurrency,
  formatDistance,
  formatUpdatedAt,
  formatAgeLabel
} from '../utils/format'
import { fuelFromApi, fuelOptionFor } from '../utils/fuel'
import {
  FRESHNESS_LABELS,
  type ListedStation
} from '../utils/stations'
import DirectionsLinks from './DirectionsLinks.vue'
import FuelBadge from './FuelBadge.vue'
import BrandBadge from './BrandBadge.vue'

const props = defineProps<{
  station: ListedStation
  isFavorite: boolean
  isRecommended?: boolean
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
const isFreshnessNotable = computed(() => freshnessStatus.value !== 'fresh')
const netSavings = computed(() => props.station.economics.netSavings)
const grossSavings = computed(() => props.station.economics.grossSavings)
const detourCost = computed(() => props.station.economics.detourCost)
const hasEconomics = computed(() => netSavings.value !== null && grossSavings.value !== null && detourCost.value !== null)
const favoriteLabel = computed(() => (props.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'))

// Coloration du prix cohérente avec les marqueurs de la carte : rupture si la
// donnée est exclue, sinon vert/terracotta selon le signe de l'économie nette
// déjà calculée par le serveur (pas une nouvelle règle métier).
const priceTone = computed(() => {
  if (freshnessStatus.value === 'obsolete') return 'rupture'
  if (props.station.isReference || netSavings.value === null) return 'neutral'
  if (netSavings.value > 0) return 'cheap'
  if (netSavings.value < 0) return 'exp'
  return 'neutral'
})
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
    <div class="station-top">
      <div class="station-id">
        <h3 class="station-name">
          {{ station.name }}
        </h3>
        <BrandBadge
          v-if="brandLabel"
          :brand="station.brand"
          :logo-url="station.logoUrl ?? null"
          :name="station.name"
          class="station-brand-badge"
        />
        <p v-if="isRecommended" class="pill pill-accent station-recommended-badge">
          <span aria-hidden="true">★</span> Recommandée
        </p>
        <p class="station-sub">
          {{ distanceLabel }}
          <span v-if="detourCost !== null && detourCost !== undefined"> · détour {{ formatCurrency(detourCost) }}</span>
        </p>
      </div>

      <div class="station-price-col">
        <span class="station-price tabular-nums" :data-tone="priceTone" data-testid="station-price">{{ priceLabel }}</span>
        <FuelBadge v-if="fuelLabel" :fuel="fuelLabel" />
      </div>
    </div>

    <div class="station-flags">
      <span
        v-if="hasEconomics"
        class="station-savings"
        :class="{ positive: (netSavings ?? 0) >= 0 }"
        data-testid="station-net-savings"
      >
        Économie nette&nbsp;<strong>{{ formatCurrency(netSavings!) }}</strong>
      </span>
      <span v-if="isFreshnessNotable" class="pill pill-muted station-freshness-badge" :data-freshness="freshnessStatus">
        <span class="freshness-dot" aria-hidden="true" />
        {{ freshnessLabel }}
      </span>
    </div>

    <p class="station-updated">
      mis à jour le {{ updatedAtLabel }}<span v-if="ageLabel"> ({{ ageLabel }})</span>
    </p>

    <p v-if="!hasEconomics && station.isReference" class="station-reference-note" role="note">
      Station de référence : point de comparaison des prix.
    </p>
    <p v-else-if="!hasEconomics && freshnessStatus === 'obsolete'" class="station-reference-note" role="note">
      Prix trop ancien : non pris en compte dans les recommandations.
    </p>

    <div class="station-actions">
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
      <DirectionsLinks v-if="station" :position="station.position" class="station-directions-row" />
    </div>
  </article>
</template>

<style scoped>
.station-card {
  display: grid;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.station-card.is-reference {
  box-shadow: none;
  border: 1px dashed var(--border);
}
.station-card.is-stale {
  opacity: 0.9;
}
.station-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}
.station-id {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.station-name {
  margin: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.95rem;
  line-height: 1.3;
}
.station-brand-badge {
  justify-self: start;
}
.station-recommended-badge {
  margin: 0;
  align-self: start;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
}
.station-sub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-700);
}
.station-price-col {
  flex: 0 0 auto;
  display: grid;
  justify-items: end;
  gap: 0.25rem;
}
.station-price {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-900);
  white-space: nowrap;
}
.station-price[data-tone='cheap'] {
  color: var(--positive);
}
.station-price[data-tone='exp'] {
  color: var(--negative);
}
.station-price[data-tone='rupture'] {
  color: var(--text-700);
}
.station-flags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.station-savings {
  font-size: 0.82rem;
  color: var(--text-700);
}
.station-savings strong {
  color: var(--text-700);
}
.station-savings.positive strong {
  color: var(--positive);
}
.station-freshness-badge {
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
}
.station-freshness-badge[data-freshness='obsolete'] {
  background: var(--terracotta-bg);
  color: var(--terracotta-strong);
}
.freshness-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
.station-updated {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-700);
}
.station-reference-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-700);
}
.station-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.favorite-btn {
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-700);
  cursor: pointer;
  font-size: 1.1rem;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
.favorite-btn:hover {
  background: var(--slate-100);
}
.favorite-btn.active {
  color: var(--terracotta-strong);
  border-color: var(--terracotta);
  background: var(--terracotta-bg);
}
</style>
