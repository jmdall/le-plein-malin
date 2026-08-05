// composables/useDarkMode.ts — Mode sombre clair/sombre (ticket 010, spec
// §2.1 mode sombre, NFR-ACC-2 contrastes AA dans les deux modes). Préférence
// mémorisée localement ; défaut : préférence système ; chargement sans flash
// géré par un script inline dans le <head> (useHead) côté client.
import { ref, watch } from 'vue'
import { storageGet, storageSet, STORAGE_KEYS } from '../utils/storage'

export type Theme = 'light' | 'dark' | 'system'

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') {
    return
  }
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function useDarkMode() {
  const theme = ref<Theme>('system')

  if (import.meta.client) {
    const stored = storageGet<Theme | null>(STORAGE_KEYS.theme, null)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      theme.value = stored
    } else {
      theme.value = 'system'
    }
    applyTheme(theme.value)
  }

  watch(theme, (value) => {
    storageSet(STORAGE_KEYS.theme, value)
    applyTheme(value)
  })

  function setTheme(value: Theme) {
    theme.value = value
  }

  return { theme, setTheme }
}
