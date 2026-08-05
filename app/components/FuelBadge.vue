<script setup lang="ts">
// FuelBadge — Badge carburant compact (ticket 010). Affichage accessible :
// le libellé texte porte l'information (aria-label), la couleur du point
// n'est qu'un renfort décoratif (NFR-ACC-4). Utilise .pill/.pill-outline du
// socle : le fond et le texte restent AA quel que soit le carburant, seule la
// teinte du point change — jamais de couleur en dur.
import { computed } from 'vue'
import { fuelOptionFor, type FuelValue } from '../utils/fuel'

const props = defineProps<{
  fuel: FuelValue | string
}>()

const option = computed(() => fuelOptionFor(props.fuel as FuelValue))
const short = computed(() => option.value.value)
const label = computed(() => option.value.label)

const FUEL_DOT_COLOR: Record<string, string> = {
  SP95: 'var(--green-500)',
  'SP95-E10': 'var(--green-600)',
  SP98: 'var(--green-700)',
  Gazole: 'var(--text-700)',
  E85: 'var(--lavender)',
  GPLc: 'var(--terracotta)'
}
const dotColor = computed(() => FUEL_DOT_COLOR[short.value] ?? 'var(--text-500)')
</script>

<template>
  <span class="fuel-badge pill pill-outline" :data-fuel="short" :aria-label="`Carburant ${label}`">
    <span class="fuel-badge-dot badge-dot" :style="{ color: dotColor }" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.fuel-badge {
  padding: 0.15rem 0.55rem 0.15rem 0.45rem;
  gap: 0.35rem;
  font-size: 0.72rem;
  line-height: 1.3;
}
.fuel-badge-dot {
  width: 7px;
  height: 7px;
}
</style>
