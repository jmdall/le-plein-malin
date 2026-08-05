<script setup lang="ts">
// StationList — Liste des stations, affichée dans la bottom sheet de l'écran
// carte (ticket 011, spec §5.3 STA-1/2/3/4, §6 FRE-1/3 ; écran carte plein
// viewport, docs/design/ui-reference.md). Les données viennent de GET
// /api/stations avec la même position/rayon/carburant que la recommandation.
// Tri par défaut économie nette décroissante, favoris en tête, référence et
// non rentables en bas (STA-2/STA-4). Les prix > 48 h restent visibles avec
// badge explicite (STA-3, FRE-3). Aucune règle métier dupliquée côté client.
//
// La feuille est plus étroite que le viewport (panneau desktop ~380 px) : les
// colonnes de la grille de cartes réagissent à la largeur du CONTENEUR
// (@container), pas à celle du viewport, pour ne jamais se casser dans la
// feuille (docs/design/ui-reference.md).
import { computed, ref, watch } from 'vue'
import type { ListedStation, StationsRequest } from '../utils/stations'
import { sortStations } from '../utils/stations'
import { useStations } from '../composables/useStations'
import { useFavorites } from '../composables/useFavorites'
import StationCard from './StationCard.vue'

const props = defineProps<{
  request: StationsRequest | null
  /** id de la station recommandée (reco.recommendedStation.id) : la carte de
      la liste correspondante porte le badge « ★ Recommandée » (ui-reference §4). */
  recommendedStationId?: string | null
}>()

const stations = useStations()
const favorites = useFavorites()

const visibleCount = ref(10)

watch(
  () => props.request,
  (value) => {
    if (value) {
      void stations.refresh(value)
    }
  },
  { immediate: true }
)

const loading = computed(() => stations.state.value.status === 'loading')
const error = computed(() => stations.state.value.status === 'error')
const errorMessage = computed(() => stations.state.value.error ?? 'Erreur inconnue.')
const list = computed<ListedStation[]>(() => stations.state.value.data?.stations ?? [])
const sorted = computed(() => sortStations(list.value, favorites.favorites.value))
const visible = computed(() => sorted.value.slice(0, visibleCount.value))
const total = computed(() => sorted.value.length)
const hasMore = computed(() => visible.value.length < total.value)
const title = computed(() => {
  if (loading.value) return 'Recherche des stations…'
  if (total.value === 0) return 'Aucune station trouvée'
  return `${total.value} station${total.value > 1 ? 's' : ''}`
})

function showMore() {
  visibleCount.value += 10
}

function retry() {
  if (props.request) {
    void stations.refresh(props.request)
  }
}

function onToggleFavorite(id: string) {
  favorites.toggleFavorite(id)
}
</script>

<template>
  <section class="station-list" aria-label="Liste des stations" data-testid="station-list">
    <header class="station-list-header">
      <h2 class="station-list-title">{{ title }}</h2>
      <p v-if="!loading && error === false && total > 0" class="station-list-hint">
        Triées par économie nette décroissante, favoris en tête.
      </p>
    </header>

    <p v-if="error" class="station-list-error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="error === false && loading === false && total === 0" class="station-list-empty" role="status">
      Aucune station dans ce rayon pour ce carburant. Essayez d’élargir le rayon
      ou de changer de carburant.
    </p>
    <div v-if="error" class="station-more">
      <button type="button" class="btn btn-secondary" @click="retry">Réessayer</button>
    </div>

    <div v-if="loading" class="station-skeleton" role="status" aria-live="polite" aria-busy="true">
      <div v-for="i in 3" :key="i" class="skeleton skeleton-station" aria-hidden="true" />
      <p class="sr-only">Chargement des stations…</p>
    </div>

    <ul v-else class="station-cards">
      <li v-for="station in visible" :key="station.id">
        <StationCard
          :station="station"
          :is-favorite="favorites.isFavorite(station.id)"
          :is-recommended="props.recommendedStationId != null && station.id === props.recommendedStationId"
          @toggle-favorite="onToggleFavorite"
        />
      </li>
    </ul>

    <div v-if="hasMore" class="station-more">
      <button type="button" class="btn btn-secondary" @click="showMore">
        Afficher plus de stations
      </button>
    </div>
  </section>
</template>

<style scoped>
.station-list {
  container-type: inline-size;
  display: grid;
  gap: 0.6rem;
}
.station-list-header {
  display: grid;
  gap: 0.15rem;
}
.station-list-title {
  margin: 0;
  font-size: 1.05rem;
}
.station-list-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.station-list-error {
  margin: 0;
  padding: 0.8rem 1rem;
  /* Fond d'alerte douce + texte terracotta lisible : tokens seuls, remappés
     automatiquement en sombre (html.dark) — jamais de couleur en dur. */
  border: 1px solid var(--terracotta);
  border-radius: 0.6rem;
  background: var(--terracotta-bg);
  color: var(--terracotta-strong);
  font-size: 0.95rem;
}
.station-list-empty {
  margin: 0;
  padding: 0.9rem 1rem;
  border: 1px dashed var(--border);
  border-radius: 0.6rem;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.95rem;
}
.station-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}
.station-more {
  display: flex;
  justify-content: center;
}
.station-skeleton {
  display: grid;
  gap: 0.6rem;
}
.skeleton-station {
  height: 9rem;
  border-radius: 0.75rem;
  background: var(--surface-raised);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

/* Colonnes pilotées par la largeur RÉELLE de la feuille (conteneur), pas par
   le viewport : le panneau desktop (~380 px) doit rester à 1 colonne. */
@container (min-width: 640px) {
  .station-cards {
    grid-template-columns: 1fr 1fr;
  }
}
@container (min-width: 900px) {
  .station-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
