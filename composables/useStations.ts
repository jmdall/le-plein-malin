// composables/useStations.ts — Chargement de la liste des stations (ticket 011,
// spec §8 GET /api/stations). Mêmes paramètres de recherche que la
// recommandation (même position/rayon/carburant). États explicites :
// idle | loading | success | error. Aucune règle métier dupliquée : le serveur
// fournit distance, fraîcheur et économies (STA-1, REC-2/D1).
//
// L'état est PARTAGÉ au niveau module (singleton) : StationList rafraîchit la
// liste et StationMap lit les mêmes données depuis le parent — un seul fetch
// par recherche, aucune divergence (ticket 012).
import { ref, type Ref } from 'vue'
import type { StationsRequest, StationsQueryResult } from '../utils/stations'

export type StationsStatus = 'idle' | 'loading' | 'success' | 'error'

export interface StationsState {
  status: StationsStatus
  data: StationsQueryResult | null
  error: string | null
  startedAt: number | null
  searchToken: string | null
}

export interface UseStationsReturn {
  state: Ref<StationsState>
  lastSearch: Ref<StationsRequest | null>
  refresh: (request: StationsRequest) => Promise<StationsQueryResult | null>
}

const EMPTY: StationsState = {
  status: 'idle',
  data: null,
  error: null,
  startedAt: null,
  searchToken: null
}

// État partagé entre toutes les instances du composable.
const state = ref<StationsState>({ ...EMPTY })
const lastSearch = ref<StationsRequest | null>(null)
let token = 0

export function useStations(): UseStationsReturn {
  async function refresh(request: StationsRequest): Promise<StationsQueryResult | null> {
    lastSearch.value = request
    const myToken = ++token
    state.value = { ...EMPTY, status: 'loading', startedAt: Date.now(), searchToken: String(myToken) }

    const params = new URLSearchParams()
    if (request.lat !== undefined && request.lon !== undefined) {
      params.set('lat', String(request.lat))
      params.set('lon', String(request.lon))
    } else if (request.postalCode) {
      params.set('postalCode', request.postalCode)
    } else if (request.city) {
      params.set('city', request.city)
    } else if (request.q) {
      params.set('q', request.q)
    }
    params.set('radius', String(request.radius))
    params.set('fuel', request.fuel)

    const url = `/api/stations?${params.toString()}`

    let response: Response
    try {
      response = await fetch(url)
    } catch {
      if (myToken !== token) return null
      state.value = {
        ...EMPTY,
        status: 'error',
        error: 'Impossible de joindre le serveur. Vérifiez votre connexion.',
        startedAt: Date.now()
      }
      return null
    }

    if (!response.ok) {
      let message = 'Le serveur a renvoyé une erreur.'
      try {
        const body = (await response.json()) as { error?: { message?: string } }
        if (body.error?.message) {
          message = body.error.message
        }
      } catch {
        // corps non JSON : on garde le message générique
      }
      if (myToken !== token) return null
      state.value = {
        ...EMPTY,
        status: 'error',
        error: message,
        startedAt: Date.now()
      }
      return null
    }

    let data: StationsQueryResult
    try {
      const body = (await response.json()) as { stations?: unknown } | StationsQueryResult
      if (!body || !Array.isArray((body as StationsQueryResult).stations)) {
        throw new Error('reponse invalide')
      }
      data = body as StationsQueryResult
    } catch {
      if (myToken !== token) return null
      state.value = {
        ...EMPTY,
        status: 'error',
        error: 'Le serveur a renvoyé une réponse invalide.',
        startedAt: Date.now()
      }
      return null
    }

    if (myToken !== token) return null
    state.value = { ...EMPTY, status: 'success', data, startedAt: Date.now(), searchToken: String(myToken) }
    return data
  }

  return { state, lastSearch, refresh }
}
