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
import { OSM_ATTRIBUTION_NOTE } from '../utils/stationIdentity'
import FuelBadge from '../components/FuelBadge.vue'
import DirectionsLinks from '../components/DirectionsLinks.vue'
import BrandBadge from '../components/BrandBadge.vue'

useHead({ title: 'Favoris — Je fais le plein ou non ?' })

// Détail d'une station favorite (GET /api/stations/:id). Une station sans
// prix en base renvoie price/fuel/updatedAt null (jamais un prix fabriqué) :
// l'UI affiche « prix indisponible » dans ce cas.
interface FavoriteStationDetail {
  id: string
  name: string
  brand: string | null
  logoUrl?: string | null
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

    <div v-else-if="ids.length === 0" class="card empty-state" role="status">
      <p class="empty-icon" aria-hidden="true">⭐</p>
      <p class="empty-title">Aucun favori pour le moment</p>
      <p class="empty-text">
        Ajoutez une station en appuyant sur l’étoile ☆ dans la liste des
        stations de la carte, ou faites une recherche depuis l’accueil.
      </p>
      <NuxtLink to="/" class="btn btn-primary">Aller à la carte</NuxtLink>
    </div>

    <template v-else>
      <p v-if="error" class="favorites-error" role="alert">{{ error }}</p>

      <ul class="favorite-list">
        <li v-for="station in stations" :key="station.id" class="card favorite-card">
          <header class="favorite-header">
            <p class="favorite-name">
              {{ station.name }}
            </p>
            <BrandBadge
              v-if="station.brand"
              :brand="station.brand"
              :logo-url="station.logoUrl ?? null"
              :name="station.name"
            />
            <button
              type="button"
              class="btn btn-ghost favorite-remove"
              :aria-label="`Retirer ${station.name} des favoris`"
              @click="removeFavorite(station.id)"
            >
              ★ Retirer
            </button>
          </header>

          <address class="favorite-address">
            {{ station.address }}, {{ station.postalCode }} {{ station.city }}
          </address>

          <dl class="favorite-meta">
            <div v-if="station.fuel" class="favorite-meta-item">
              <dt class="sr-only">Carburant</dt>
              <dd><FuelBadge :fuel="station.fuel" /></dd>
            </div>
            <div class="favorite-meta-item">
              <dt class="sr-only">Prix</dt>
              <dd class="favorite-price">
                {{ station.price !== null ? formatPrice(station.price) : '' }}
                <span v-if="station.price === null" class="muted">prix indisponible</span>
              </dd>
            </div>
          </dl>

          <p v-if="station.updatedAt" class="favorite-updated">
            Mis à jour le {{ formatUpdatedAt(new Date(station.updatedAt)) }}
          </p>

          <DirectionsLinks :position="station.position" class="favorite-directions" />
        </li>
      </ul>

      <div class="favorite-clear">
        <button type="button" class="btn btn-secondary" @click="clearAll">Vider les favoris</button>
      </div>

      <p class="favorites-attribution" role="note">{{ OSM_ATTRIBUTION_NOTE }}</p>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.25rem 1rem 2.5rem;
}
.page-title {
  margin: 0 0 0.35rem;
  font-size: 1.5rem;
}
.page-tagline {
  margin: 0 0 1.25rem;
  color: var(--text-muted);
}
.empty-state {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  text-align: center;
  padding: 2rem 1.5rem;
}
.empty-icon {
  margin: 0;
  font-size: 2rem;
}
.empty-title {
  margin: 0;
  font-weight: 700;
  font-size: 1.1rem;
}
.empty-text {
  margin: 0 0 0.5rem;
  color: var(--text-muted);
  max-width: 26rem;
}
.favorites-error {
  margin: 0 0 0.75rem;
  padding: 0.8rem 1rem;
  border-radius: var(--r-md);
  background: var(--terracotta-bg);
  color: var(--terracotta-strong);
}
.favorite-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.favorite-card {
  display: grid;
  gap: 0.4rem;
}
.favorite-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
  align-items: flex-start;
}
.favorite-name {
  margin: 0;
  font-weight: 600;
}
.favorite-remove {
  flex: none;
  padding: 0 0.9rem;
  font-size: 0.85rem;
}
.favorite-address {
  margin: 0;
  font-style: normal;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.favorite-meta {
  margin: 0.1rem 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
.favorite-meta-item dd {
  margin: 0;
}
.favorite-price {
  font-weight: 700;
  font-size: 1.05rem;
}
.muted {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.85rem;
}
.favorite-updated {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.favorite-directions {
  margin-top: 0.2rem;
}
.favorite-clear {
  margin-top: 0.5rem;
}
.favorites-attribution {
  margin: 1.25rem 0 0;
  font-size: 0.75rem;
  color: var(--text-500);
  line-height: 1.4;
}
</style>
