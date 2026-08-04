<script setup lang="ts">
// DirectionsLinks — Liens d'itinéraire (ticket concurrent, spec §4 #7).
// OSM est le lien principal (libre, sans clé) ; Waze et Google Maps sont
// proposés en alternatives (apps de navigation installées côté mobile).
// Composant partagé : utilisé par StationCard, RecommendationCard et la page
// favoris — une seule source de markup (revue /code-review : anti-duplication).
import { computed } from 'vue'
import { buildDirectionsLinks } from '../utils/location'

const props = defineProps<{
  position: { lat: number; lon: number }
}>()

const links = computed(() => buildDirectionsLinks(props.position))
</script>

<template>
  <span class="directions-links" role="group" aria-label="Itinéraire vers la station">
    <a
      :href="links.osm"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-secondary station-directions"
    >
      <span aria-hidden="true">↗</span> Itinéraire
    </a>
    <a
      :href="links.waze"
      target="_blank"
      rel="noopener noreferrer"
      class="directions-alt"
      aria-label="Ouvrir l’itinéraire dans Waze"
      title="Waze"
    >
      <span aria-hidden="true">↗</span> Waze
    </a>
    <a
      :href="links.googleMaps"
      target="_blank"
      rel="noopener noreferrer"
      class="directions-alt"
      aria-label="Ouvrir l’itinéraire dans Google Maps"
      title="Google Maps"
    >
      <span aria-hidden="true">↗</span> Maps
    </a>
  </span>
</template>

<style scoped>
.directions-links {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.directions-alt {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-700);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}
.directions-alt:hover {
  background: var(--slate-100);
}
.directions-alt:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
