// composables/useGeolocation.ts — Consentement + géolocalisation (ticket 010,
// LOC-1 : bannière recommandée non bloquante, LOC-2 : recherche ville/CP sans
// géoloc, LOC-4 : la position précise n'est jamais persistée).
import { ref, type Ref } from 'vue'
import {
  readGeoConsent,
  requestGeolocation,
  writeGeoConsent,
  type ConsentStatus,
  type GeoPosition,
  type LocationQuery
} from '../utils/location'
import { storageGet, STORAGE_KEYS } from '../utils/storage'
import { fuelFromApi } from '../utils/fuel'
import type { FuelValue } from '../utils/fuel'

export interface UseGeolocationReturn {
  consent: Ref<ConsentStatus>
  permissionSupported: Ref<boolean>
  position: Ref<GeoPosition | null>
  geolocationError: Ref<string | null>
  locating: Ref<boolean>
  savedQuery: Ref<LocationQuery | null>
  savedLocationLabel: Ref<string | null>
  savedFuel: Ref<FuelValue>
  request: () => Promise<{ ok: boolean; denied?: boolean; error?: string }>
  deny: () => void
  resetConsent: () => void
  setSavedQuery: (q: LocationQuery | null) => void
  hasPersistedLocation: () => boolean
}

export function useGeolocation(): UseGeolocationReturn {
  const consent = ref<ConsentStatus>('undecided')
  const position = ref<GeoPosition | null>(null)
  const geolocationError = ref<string | null>(null)
  const locating = ref(false)
  const savedQuery = ref<LocationQuery | null>(null)
  const savedLocationLabel = ref<string | null>(null)
  const savedFuel = ref<FuelValue>('Gazole')

  const permissionSupported = ref(false)

  if (import.meta.client) {
    consent.value = readGeoConsent()
    const stored = storageGet<LocationQuery | null>(STORAGE_KEYS.location, null)
    if (stored) {
      savedQuery.value = stored
      savedLocationLabel.value = stored.q
    }
    savedFuel.value = fuelFromApi(storageGet<string | null>(STORAGE_KEYS.fuel, null) ?? undefined)
    if (
      typeof window !== 'undefined' &&
      typeof window.navigator !== 'undefined' &&
      'permissions' in window.navigator &&
      typeof window.navigator.permissions.query === 'function'
    ) {
      permissionSupported.value = true
    }
  }

  function setSavedQuery(query: LocationQuery | null) {
    savedQuery.value = query
    savedLocationLabel.value = query?.q ?? null
  }

  async function request() {
    // Sur l'APK (WebView Capacitor), la géolocalisation passe par le bridge
    // natif @capacitor/geolocation : `isGeoAvailable()` (navigator.geolocation)
    // n'y est PAS fiable et ne doit pas bloquer la requête native.
    locating.value = true
    geolocationError.value = null
    const result = await requestGeolocation()
    locating.value = false
    if (result.ok && result.position) {
      consent.value = 'granted'
      writeGeoConsent('granted')
      position.value = result.position
      return { ok: true }
    }
    if (result.denied) {
      consent.value = 'denied'
      writeGeoConsent('denied')
      position.value = null
      geolocationError.value = result.error ?? 'Géolocalisation refusée.'
      return { ok: false, denied: true, error: geolocationError.value }
    }
    geolocationError.value = result.error ?? 'Impossible de vous localiser.'
    return { ok: false, error: geolocationError.value }
  }

  function deny() {
    consent.value = 'denied'
    writeGeoConsent('denied')
    position.value = null
  }

  function resetConsent() {
    consent.value = 'undecided'
    writeGeoConsent('undecided')
    position.value = null
    geolocationError.value = null
  }

  function hasPersistedLocation() {
    return savedQuery.value !== null
  }

  return {
    consent,
    permissionSupported,
    position,
    geolocationError,
    locating,
    savedQuery,
    savedLocationLabel,
    savedFuel,
    request,
    deny,
    resetConsent,
    setSavedQuery,
    hasPersistedLocation
  }
}
