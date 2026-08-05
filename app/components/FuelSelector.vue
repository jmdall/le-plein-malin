<script setup lang="ts">
// FuelSelector — Segmented control carburant, posé sur la carte (ticket 010,
// CAR-2 : préféré mémorisé localement et présélectionné ; écran carte plein
// viewport, docs/design/ui-reference.md §2 : piste pilule .segmented, onglet
// actif .segmented-tab-active vert plein, inactifs .segmented-tab texte
// --text-700). Cibles tactiles ≥ 44 px (NFR-RES-2), défilement horizontal en
// mobile via la primitive .segmented (assets/css/main.css).
import { ref } from 'vue'
import type { FuelValue, FuelOption } from '../utils/fuel'

const props = defineProps<{
  modelValue: FuelValue
  options: FuelOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FuelValue]
}>()

const tabRefs = ref<(HTMLButtonElement | null)[]>([])

function select(value: FuelValue) {
  emit('update:modelValue', value)
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const dir = event.key === 'ArrowRight' ? 1 : -1
  const next = (index + dir + props.options.length) % props.options.length
  const target = props.options[next]
  if (!target) return
  select(target.value)
  tabRefs.value[next]?.focus()
}
</script>

<template>
  <div class="fuel-selector">
    <span id="fuel-selector-label" class="sr-only">Carburant</span>
    <div class="segmented" role="tablist" aria-labelledby="fuel-selector-label">
      <button
        v-for="(opt, index) in options"
        :key="opt.value"
        :ref="(el) => (tabRefs[index] = el as HTMLButtonElement | null)"
        type="button"
        role="tab"
        class="segmented-tab"
        :class="{ 'segmented-tab-active': modelValue === opt.value }"
        :aria-selected="modelValue === opt.value"
        :tabindex="modelValue === opt.value ? 0 : -1"
        @click="select(opt.value)"
        @keydown="onKeydown($event, index)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fuel-selector {
  max-width: 100%;
}
</style>
