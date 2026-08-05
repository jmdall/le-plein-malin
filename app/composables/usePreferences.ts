// composables/usePreferences.ts — Préférences mémorisées localement (ticket
// 010, spec §4/§5.2 : rayon LOC-3 défaut 10 km et carburant préféré CAR-2).
// Lues de façon synchrone au montage, puis persistées à chaque changement.
import { ref } from 'vue'
import { storageGet, storageSet, STORAGE_KEYS } from '../utils/storage'
import { DEFAULT_FUEL, isFuelValue, type FuelValue } from '../utils/fuel'

export const RADIUS_OPTIONS = [5, 10, 20, 30] as const
export const DEFAULT_RADIUS = 10

export function usePreferences() {
  const fuel = ref<FuelValue>(DEFAULT_FUEL)
  const radius = ref<number>(DEFAULT_RADIUS)
  const ready = ref(false)

  if (import.meta.client) {
    const storedFuel = storageGet<string>(STORAGE_KEYS.fuel, DEFAULT_FUEL)
    if (isFuelValue(storedFuel)) {
      fuel.value = storedFuel
    }

    const storedRadius = storageGet<number>(STORAGE_KEYS.radius, DEFAULT_RADIUS)
    if (RADIUS_OPTIONS.includes(storedRadius as (typeof RADIUS_OPTIONS)[number])) {
      radius.value = storedRadius
    }

    ready.value = true
  }

  function selectFuel(value: FuelValue) {
    fuel.value = value
    storageSet(STORAGE_KEYS.fuel, value)
  }

  function selectRadius(value: number) {
    radius.value = value
    storageSet(STORAGE_KEYS.radius, value)
  }

  return { fuel, radius, ready, selectFuel, selectRadius }
}
