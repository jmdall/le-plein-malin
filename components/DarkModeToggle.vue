<script setup lang="ts">
// DarkModeToggle — Sélecteur de thème (ticket 010 : mode sombre clair/sombre).
// Préférence mémorisée localement (jflp.theme) ; défaut : système.
import { computed } from 'vue'
import { useDarkMode, type Theme } from '../composables/useDarkMode'

const { theme, setTheme } = useDarkMode()

const themes: Theme[] = ['system', 'light', 'dark']
const themeLabels: Record<Theme, string> = {
  system: 'Auto (système)',
  light: 'Clair',
  dark: 'Sombre'
}

const currentLabel = computed(() => themeLabels[theme.value] ?? themeLabels.system)
</script>

<template>
  <fieldset class="theme-fieldset">
    <legend class="sr-only">Mode d’affichage</legend>
    <div class="theme-group" role="radiogroup" aria-label="Mode d’affichage">
      <button
        v-for="t in themes"
        :key="t"
        type="button"
        class="theme-option"
        :class="{ active: theme === t }"
        :aria-pressed="theme === t"
        :aria-label="themeLabels[t]"
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
  gap: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.15rem;
  background: var(--surface);
}
.theme-option {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 0.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.theme-option:hover {
  background: var(--surface-raised);
}
.theme-option.active {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
</style>
