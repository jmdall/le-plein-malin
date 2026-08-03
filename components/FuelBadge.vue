<script setup lang="ts">
// FuelBadge — Badge carburant (ticket 010). Affichage accessible :
// le libellé texte porte l'information, la couleur est un renfort (NFR-ACC-4).
import { computed } from 'vue'
import { fuelOptionFor, type FuelValue } from '../utils/fuel'

const props = defineProps<{
  fuel: FuelValue | string
}>()

const option = computed(() => fuelOptionFor(props.fuel as FuelValue))
const short = computed(() => option.value.value)
const label = computed(() => option.value.label)
</script>

<template>
  <span class="fuel-badge" :data-fuel="short" :aria-label="`Carburant ${label}`">
    {{ label }}
  </span>
</template>

<style scoped>
.fuel-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  color: #14532d;
  background: #dcfce7;
  border: 1px solid #86efac;
}
.fuel-badge[data-fuel='SP95'] {
  color: #1e3a5f;
  background: #dbeafe;
  border-color: #93c5fd;
}
.fuel-badge[data-fuel='SP98'] {
  color: #4c1d95;
  background: #ede9fe;
  border-color: #c4b5fd;
}
.fuel-badge[data-fuel='E85'] {
  color: #7c2d12;
  background: #ffedd5;
  border-color: #fdba74;
}
.fuel-badge[data-fuel='Gazole'] {
  color: #164e63;
  background: #cffafe;
  border-color: #67e8f9;
}
.fuel-badge[data-fuel='GPLc'] {
  color: #3f3f46;
  background: #f4f4f5;
  border-color: #d4d4d8;
}

@media (prefers-color-scheme: dark) {
  html.dark .fuel-badge {
    color: #bbf7d0;
    background: #14532d;
    border-color: #166534;
  }
  html.dark .fuel-badge[data-fuel='SP95'] {
    color: #bfdbfe;
    background: #1e3a5f;
    border-color: #1d4ed8;
  }
  html.dark .fuel-badge[data-fuel='SP98'] {
    color: #ddd6fe;
    background: #4c1d95;
    border-color: #6d28d9;
  }
  html.dark .fuel-badge[data-fuel='E85'] {
    color: #fed7aa;
    background: #7c2d12;
    border-color: #c2410c;
  }
  html.dark .fuel-badge[data-fuel='Gazole'] {
    color: #a5f3fc;
    background: #164e63;
    border-color: #0e7490;
  }
  html.dark .fuel-badge[data-fuel='GPLc'] {
    color: #e4e4e7;
    background: #3f3f46;
    border-color: #52525b;
  }
}
</style>
