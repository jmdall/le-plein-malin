<script setup lang="ts">
// pages/favoris.vue — Stations favorites (ticket 013, spec §5.3 STA-4/STA-5).
// Les favoris sont des ids persistés en localStorage (useFavorites, 011).
// Cette page récupère le détail de chaque station favorite via
// GET /api/stations/:id (009) et propose l'itinéraire OSM. Liste vide →
// message + lien vers l'accueil. Aucun compte utilisateur.
import { computed, onMounted, ref } from 'vue'
import { useHead } from '#imports'
import { useFavorites } from '../composables/useFavorites'
import { formatPrice, formatUpdatedAt } from '../utils/format'

useHead({ title: 'Favoris — Je fais le plein ou non ?' })

// Détail d'une station favorite (GET /api/stations/:id). Une station sans
// prix en base renvoie price/fuel/updatedAt null (jamais un prix fabriqué) :
// l'UI affiche « prix indisponible » dans ce cas.
interface FavoriteStationDetail {
  id: string
  name: string
  brand: string | null
  address: string
  city: string
  postalCode: string
  position: { lat: number; lon: number }
  fuel: string | null
  price: number | null
  updatedAt: string | null
}

const favorites = useFavorites()
const stations = ref<FavoriteStationDetail[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const ids = computed(() => favorites.favorites.value)

onMounted(async () => {
  if (ids.value.length === 0) return
  loading.value = true
  error.value = null
  const results = await Promise.allSettled(
    ids.value.map(async (id) => {
      const res = await fetch(`/api/stations/${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`Station ${id} indisponible`)
      const body = (await res.json()) as { station: FavoriteStationDetail }
      return body.station
    })
  )
  stations.value = results
    .filter((r): r is PromiseFulfilledResult<FavoriteStationDetail> => r.status === 'fulfilled')
    .map((r) => r.value)
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) {
    error.value = `${failed} station(s) favorite(s) indisponible(s) pour le moment.`
  }
  loading.value = false
})

function removeFavorite(id: string) {
  favorites.toggleFavorite(id)
  stations.value = stations.value.filter((s) => s.id !== id)
}

function clearAll() {
  for (const id of ids.value) {
    favorites.toggleFavorite(id)
  }
  stations.value = []
}
</script>

<template>
  <main id="main" class="page">
    <h1 class="page-title">Stations favorites</h1>
    <p class="page-tagline">
      Les stations que vous avez mises en favori apparaissent en tête de liste
      lors de vos recherches.
    </p>

    <p v-if="loading" role="status">Chargement des favoris…</p>

    <p v-else-if="ids.length === 0" class="empty-state" role="status">
      Aucun favori pour le moment. Ajoutez une station avec l’étoile dans la
      liste des stations, ou faites une recherche depuis l’accueil.
    </p>

    <p v-if="error" class="favorites-error" role="alert">{{ error }}</p>

    <ul v-else class="favorite-list">
      <li v-for="station in stations" :key="station.id" class="favorite-card">
        <div class="favorite-info">
          <p class="favorite-name">
            {{ station.name }}
            <span v-if="station.brand" class="favorite-brand">— {{ station.brand }}</span>
          </p>
          <p class="favorite-meta">
            {{ station.address }}, {{ station.postalCode }} {{ station.city }}
            <template v-if="station.fuel"> · {{ station.fuel }}</template>
            <template v-if="station.price !== null"> · {{ formatPrice(station.price) }}</template>
            <template v-else> · <span class="muted">prix indisponible</span></template>
          </p>
          <p v-if="station.updatedAt" class="favorite-updated">
            Mis à jour le {{ formatUpdatedAt(new Date(station.updatedAt)) }}
          </p>
        </div>
        <div class="favorite-actions">
          <DirectionsLinks :position="station.position" />
          <button type="button" class="btn btn-secondary" :aria-label="`Retirer ${station.name} des favoris`" @click="removeFavorite(station.id)">
            Retirer
          </button>
        </div>
      </li>
    </ul>

    <div v-if="ids.length > 0" class="favorite-clear">
      <button type="button" class="btn btn-secondary" @click="clearAll">Vider les favoris</button>
    </div>
  </main>
</template>

<style scoped>
.empty-state {
  margin: 0;
  padding: 1rem;
  border: 1px dashed var(--border);
  border-radius: 0.6rem;
  background: var(--surface);
  color: var(--text-muted);
}
.favorites-error {
  margin: 0.5rem 0;
  padding: 0.8rem 1rem;
  border: 1px solid #fca5a5;
  border-radius: 0.6rem;
  background: #fef2f2;
  color: #7f1d1d;
}
html.dark .favorites-error {
  background: #450a0a;
  border-color: #7f1d1d;
  color: #fecaca;
}
.favorite-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}
.favorite-card {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}
.favorite-info {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.favorite-name {
  margin: 0;
  font-weight: 600;
}
.favorite-brand {
  font-weight: 400;
  color: var(--text-muted);
}
.favorite-meta,
.favorite-updated {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.favorite-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.favorite-clear {
  margin-top: 1rem;
}
</style>
