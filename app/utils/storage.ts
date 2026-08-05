// utils/storage.ts — Accès localStorage sûr et typé (ticket 010, spec §4/§5.2
// CAR-2/LOC-3 : rayon et carburant préféré mémorisés localement, sans compte).
// Toute erreur (désactivé, quota, JSON invalide) est neutralisée : le produit
// reste utilisable avec les valeurs par défaut.
export const STORAGE_KEYS = {
  fuel: 'jflp.fuel',
  radius: 'jflp.radius',
  location: 'jflp.location',
  consent: 'jflp.geoConsent',
  theme: 'jflp.theme',
  favorites: 'jflp.favorites'
} as const

export function storageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) {
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function storageSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage indisponible : on abandonne silencieusement (utilisable
    // sans persistance locale).
  }
}

export function storageRemove(key: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    // idem
  }
}
