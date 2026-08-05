// composables/useFuelRecommendation.ts — Chargement de la recommandation
// (ticket 010, spec §8 GET /api/recommendation). États explicites :
// idle | loading | success | error | empty. Aucune règle métier n'est
// dupliquée côté client : on consomme la réponse de l'API (REC-2/D1).
import { ref, type Ref } from 'vue'
import { fuelToApi } from '../utils/fuel'
import { apiUrl } from '../utils/api'
import type { RecommendationRequest, Recommendation } from '../utils/recommendation'

export type RecommendationStatus = 'idle' | 'loading' | 'success' | 'error' | 'empty'

export interface RecommendationState {
  status: RecommendationStatus
  data: Recommendation | null
  error: string | null
  startedAt: number | null
  searchToken: string | null
}

export interface UseFuelRecommendationReturn {
  state: Ref<RecommendationState>
  lastSearch: Ref<RecommendationRequest | null>
  refresh: (request: RecommendationRequest) => Promise<Recommendation | null>
}

const EMPTY: RecommendationState = {
  status: 'idle',
  data: null,
  error: null,
  startedAt: null,
  searchToken: null
}

export function useFuelRecommendation(): UseFuelRecommendationReturn {
  const state = ref<RecommendationState>({ ...EMPTY })
  const lastSearch = ref<RecommendationRequest | null>(null)
  let token = 0

  async function refresh(request: RecommendationRequest): Promise<Recommendation | null> {
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
    params.set('fuel', fuelToApi(request.fuel))

    const url = apiUrl(`/api/recommendation?${params.toString()}`)

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

    let data: Recommendation
    try {
      const body = (await response.json()) as { recommendation: Recommendation }
      data = body.recommendation
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
    if (data.type === 'insufficient-data') {
      state.value = { ...EMPTY, status: 'empty', data, startedAt: Date.now(), searchToken: String(myToken) }
      return data
    }
    state.value = { ...EMPTY, status: 'success', data, startedAt: Date.now(), searchToken: String(myToken) }
    return data
  }

  return { state, lastSearch, refresh }
}
