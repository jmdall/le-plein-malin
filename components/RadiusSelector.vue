<script setup lang="ts">
// RadiusSelector — Sélecteur de rayon (ticket 010, LOC-3 : 5/10/20/30 km,
// défaut 10). Même langage que le segmented control carburant (.segmented du
// socle), en variante compacte « dans une page » (.segmented-inset : pas de
// carte dessous). Contrôles tactiles ≥ 44 px (NFR-RES-2), focus visible.
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
    <div class="segmented segmented-inset radius-group" role="radiogroup" aria-label="Rayon de recherche">
      <label
        v-for="opt in options"
        :key="opt"
        class="segmented-tab radius-option"
        :class="{ 'segmented-tab-active': modelValue === opt }"
      >
        <input
          :checked="modelValue === opt"
          class="sr-only"
          type="radio"
          name="radius"
          :value="opt"
          @change="emit('update:modelValue', opt)"
        >
        {{ opt }} km
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
  gap: 0.35rem;
}
.radius-legend {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-700);
}
.radius-group {
  width: 100%;
  justify-content: space-between;
}
.radius-option {
  flex: 1 1 0;
  min-width: 3.5rem;
  padding: 0 0.6rem;
}
.radius-option:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
