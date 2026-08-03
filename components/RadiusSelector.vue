<script setup lang="ts">
// RadiusSelector — Sélecteur de rayon (ticket 010, LOC-3 : 5/10/20/30 km,
// défaut 10). Contrôles tactiles ≥ 44 px (NFR-RES-2), focus visible.
defineProps<{
  modelValue: number
  options: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()
</script>

<template>
  <fieldset class="radius-fieldset">
    <legend class="radius-legend">Rayon de recherche</legend>
    <div class="radius-group">
      <label
        v-for="opt in options"
        :key="opt"
        class="radius-option"
        :class="{ active: modelValue === opt }"
      >
        <input
          :checked="modelValue === opt"
          class="sr-only"
          type="radio"
          name="radius"
          :value="opt"
          @change="emit('update:modelValue', opt)"
        >
        <span class="radius-label">{{ opt }} km</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.radius-fieldset {
  border: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.radius-legend {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}
.radius-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.radius-option {
  flex: 1 1 auto;
  min-width: 3.5rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.radius-option:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.radius-option:hover {
  background: var(--surface-raised);
}
.radius-option.active {
  background: var(--accent);
  border-color: var(--accent);
}
.radius-option.active .radius-label {
  color: var(--accent-contrast);
  font-weight: 600;
}
.radius-label {
  color: var(--text);
  font-size: 0.9rem;
}
</style>
