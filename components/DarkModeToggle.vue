<script setup lang="ts">
// DarkModeToggle — Sélecteur de thème (ticket 010 : mode sombre clair/sombre).
// Préférence mémorisée localement (jflp.theme) ; défaut : système. Même
// langage que le segmented control carburant (.segmented du socle), variante
// compacte « dans une page » (.segmented-inset).
import { computed } from 'vue'
import { useDarkMode, type Theme } from '../composables/useDarkMode'

const { theme, setTheme } = useDarkMode()

const themes: Theme[] = ['system', 'light', 'dark']
const themeLabels: Record<Theme, string> = {
  system: 'Auto',
  light: 'Clair',
  dark: 'Sombre'
}
const themeFullLabels: Record<Theme, string> = {
  system: 'Auto (système)',
  light: 'Clair',
  dark: 'Sombre'
}

const currentLabel = computed(() => themeFullLabels[theme.value] ?? themeFullLabels.system)
</script>

<template>
  <fieldset class="theme-fieldset">
    <legend class="sr-only">Mode d’affichage</legend>
    <div class="segmented segmented-inset theme-group" role="radiogroup" aria-label="Mode d’affichage">
      <button
        v-for="t in themes"
        :key="t"
        type="button"
        class="segmented-tab theme-option"
        :class="{ 'segmented-tab-active': theme === t }"
        :aria-pressed="theme === t"
        :aria-label="themeFullLabels[t]"
        @click="setTheme(t)"
      >
        {{ themeLabels[t] }}
      </button>
    </div>
    <p class="sr-only">Mode actuel : {{ currentLabel }}</p>
  </fieldset>
</template>

<style scoped>
.theme-fieldset {
  border: none;
  margin: 0;
  padding: 0;
}
.theme-group {
  display: inline-flex;
}
.theme-option {
  padding: 0 0.85rem;
}
</style>
