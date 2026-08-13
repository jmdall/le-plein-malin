// utils/location.ts — Groupe géolocalisation + recherche ville/CP (ticket 010,
// spec §4 parcours principal et sans géolocalisation). Le consentement
// (LOC-1) et le dernier lieu de recherche (LOC-2) sont mémorisés localement.
// La position précise n'est jamais persistée (LOC-4, NFR-SEC-4) : on ne garde
// que le consentement et la ville/CP saisie.
import { isSearchablePosition } from '../../domain/fuel-prices/searchBounds'
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from './storage'
import type { RecommendationRequest } from './recommendation'

export interface GeoPosition {
  lat: number
  lon: number
}

export type ConsentStatus = 'granted' | 'denied' | 'undecided'

export type LocationSource = 'geo' | 'city' | 'postalCode'

export interface LocationQuery {
  source: LocationSource
  q: string
}

// ——— Consentement (LOC-1 : refuser n'empêche pas l'usage) ———
export function readGeoConsent(): ConsentStatus {
  return storageGet<ConsentStatus>(STORAGE_KEYS.consent, 'undecided')
}

export function writeGeoConsent(value: ConsentStatus): void {
  storageSet(STORAGE_KEYS.consent, value)
}

// ——— Dernier lieu de recherche ville/CP mémorisé (LOC-2) ———
export function readSavedLocation(): LocationQuery | null {
  return storageGet<LocationQuery | null>(STORAGE_KEYS.location, null)
}

export function saveLocation(query: LocationQuery): void {
  storageSet(STORAGE_KEYS.location, query)
}

export function clearSavedLocation(): void {
  storageRemove(STORAGE_KEYS.location)
}

// ——— Décision de recherche ville / CP / adresse (ticket 031) ———
// Fonction PURE : elle décide ce qui part vers l'API et ce qui est mémorisé,
// sans toucher au stockage ni au réseau. Extraite de pages/index.vue pour être
// testable — c'est la règle qui corrige le double géocodage.
//
// Priorité : une position explicitement choisie dans l'autocomplete gagne
// toujours. Elle part SEULE (sans q ni postalCode) : le serveur géocoderait
// sinon le texte une deuxième fois, avec un autre fournisseur et donc un autre
// centre — la station de référence ne serait plus celle du point choisi.
//
// Deux replis sur le texte, tous deux vers le comportement d'origine
// (5 chiffres → postalCode, sinon q) :
//   - aucune position (saisie libre, rejeu de la dernière recherche) ;
//   - position hors des bornes acceptées par l'API
//     (domain/fuel-prices/searchBounds.ts). Le BAN couvre l'outre-mer, l'API
//     non : envoyer ces coordonnées transformerait une recherche qui marchait
//     en erreur 400.
export type SearchTarget = Pick<RecommendationRequest, 'lat' | 'lon' | 'positionSource'> &
  Pick<RecommendationRequest, 'postalCode' | 'q'>

export interface ResolvedSearch {
  // Libellé affiché (« Recherche autour de … ») : le texte, jamais des
  // coordonnées.
  label: string
  target: SearchTarget
  // Ce qui est mémorisé localement. Aucune coordonnée n'y figure jamais
  // (LOC-4, NFR-SEC-4) : le rejeu au montage repasse par le géocodage serveur.
  saved: LocationQuery
}

const POSTAL_CODE_RE = /^\d{5}$/

export function resolveSearchInput(
  input: string,
  position: GeoPosition | null
): ResolvedSearch | null {
  const label = input.trim()
  if (label === '') return null

  const isPostal = POSTAL_CODE_RE.test(label)
  const saved: LocationQuery = { source: isPostal ? 'postalCode' : 'city', q: label }

  if (isSearchablePosition(position)) {
    // `place` : centre exact, mais ce n'est pas la position de l'utilisateur —
    // le serveur garde son hypothèse de détour (§13 #16).
    return {
      label,
      target: { lat: position.lat, lon: position.lon, positionSource: 'place' },
      saved
    }
  }
  return { label, target: isPostal ? { postalCode: label } : { q: label }, saved }
}

// ——— Géolocalisation (LOC-1, LOC-4) ———
// Retourne une promesse typée : success, error (compréhensible), ou denied
// (l'utilisateur a refusé). Jamais de rejet non géré.
//
// Sur l'APK (WebView Capacitor), `navigator.geolocation` est cassé : la
// WebView n'implémente pas la boîte de permission système et renvoie
// systématiquement PERMISSION_DENIED (ticket 024). On passe donc par le
// bridge natif `@capacitor/geolocation` (requête de permission Android
// native), avec repli sur l'API navigateur ailleurs. Les deux sont importés
// dynamiquement pour rester inerte dans les tests et hors Capacitor.
export interface GeoResult {
  ok: boolean
  position?: GeoPosition
  error?: string
  denied?: boolean
}

type NativeGeolocation = {
  requestPermissions: () => Promise<{ location?: string; coarseLocation?: string }>
  getCurrentPosition: (options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }) => Promise<{
    coords: { latitude: number; longitude: number }
  }>
}

let nativeGeolocation: NativeGeolocation | null | undefined

async function loadNativeGeolocation(): Promise<NativeGeolocation | null> {
  if (nativeGeolocation !== undefined) return nativeGeolocation
  try {
    const cap = await import('@capacitor/core')
    const plugin = cap.Capacitor.isNativePlatform()
      ? cap.registerPlugin<NativeGeolocation>('Geolocation')
      : null
    nativeGeolocation = plugin
  } catch {
    nativeGeolocation = null
  }
  return nativeGeolocation
}

export function isGeoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    'geolocation' in window.navigator
  )
}

export async function requestGeolocation(): Promise<GeoResult> {
  const native = await loadNativeGeolocation()
  if (native) {
    return requestNativeGeolocation(native)
  }
  if (!isGeoAvailable()) {
    return { ok: false, error: 'La géolocalisation n’est pas disponible sur cet appareil.' }
  }
  return requestBrowserGeolocation()
}

// ——— Bridge natif Capacitor (@capacitor/geolocation, APK Android) ———
async function requestNativeGeolocation(native: NativeGeolocation): Promise<GeoResult> {
  try {
    const permissions = await native.requestPermissions()
    const granted =
      permissions.location === 'granted' || permissions.coarseLocation === 'granted'
    if (!granted) {
      return { ok: false, denied: true, error: 'Vous avez refusé la géolocalisation.' }
    }
    const position = await native.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60_000
    })
    return { ok: true, position: { lat: position.coords.latitude, lon: position.coords.longitude } }
  } catch {
    return { ok: false, error: 'Impossible d’obtenir votre position sur cet appareil.' }
  }
}

// ——— API navigateur standard (web / dev) ———
function requestBrowserGeolocation(): Promise<GeoResult> {
  return new Promise((resolve) => {
    window.navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          position: { lat: position.coords.latitude, lon: position.coords.longitude }
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, denied: true, error: 'Vous avez refusé la géolocalisation.' })
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          resolve({ ok: false, error: 'La position n’est pas disponible pour le moment.' })
        } else {
          resolve({ ok: false, error: 'La géolocalisation a expiré. Réessayez.' })
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 }
    )
  })
}

// ——— Liens « Itinéraire » (spec §4, #7) ———
// URLs publiques, sans clé, aucun service payant, hors périmètre : aucun
// routage routier intégré (D3/ADR-0002). OSM reste la destination par défaut
// (libre) ; Waze et Google Maps sont proposés en alternatives (comportement
// courant des apps concurrentes, ex. PouvoirAchat+). encodeURIComponent est
// appliqué par URLSearchParams.
export interface DirectionsLinks {
  osm: string
  waze: string
  googleMaps: string
}

export function buildDirectionsUrl(position: { lat: number; lon: number }): string {
  const params = new URLSearchParams({
    route: `${position.lat.toFixed(6)},${position.lon.toFixed(6)}`
  })
  return `https://www.openstreetmap.org/directions?${params}`
}

export function buildDirectionsLinks(position: { lat: number; lon: number }): DirectionsLinks {
  const lat = position.lat.toFixed(6)
  const lon = position.lon.toFixed(6)
  return {
    osm: buildDirectionsUrl(position),
    waze: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
  }
}
