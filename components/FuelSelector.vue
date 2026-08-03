<script setup lang="ts">
// FuelSelector — Sélecteur de carburant (ticket 010, CAR-2 : préféré mémorisé
// localement et présélectionné). SP95, SP95-E10, SP98, E85, Gazole, GPLc.
// Boutons radio stylés, cibles tactiles ≥ 44 px (NFR-RES-2).
import type { FuelValue, FuelOption } from '../utils/fuel'

defineProps<{
  modelValue: FuelValue
  options: FuelOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FuelValue]
}>()
</script>

<template>
  <fieldset class="fuel-fieldset">
    <legend class="fuel-legend">Carburant</legend>
    <div class="fuel-group">
      <label
        v-for="opt in options"
        :key="opt.value"
        class="fuel-option"
        :class="{ active: modelValue === opt.value }"
      >
        <input
          :checked="modelValue === opt.value"
          class="sr-only"
          type="radio"
          name="fuel"
          :value="opt.value"
          @change="emit('update:modelValue', opt.value)"
        >
        <span class="fuel-label">{{ opt.label }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.fuel-fieldset {
  border: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.fuel-legend {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}
.fuel-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.fuel-option {
  flex: 1 1 auto;
  min-width: 5.2rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.fuel-option:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.fuel-option:hover {
  background: var(--surface-raised);
}
.fuel-option.active {
  background: var(--accent);
  border-color: var(--accent);
}
.fuel-option.active .fuel-label {
  color: var(--accent-contrast);
  font-weight: 600;
}
.fuel-label {
  color: var(--text);
  font-size: 0.9rem;
  white-space: nowrap;
}
</style>
