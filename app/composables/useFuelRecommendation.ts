// composables/useFuelRecommendation.ts — Chargement de la recommandation
// (ticket 010, spec §8 GET /api/recommendation). États explicites :
// idle | loading | success | error | empty. Aucune règle métier n'est
// dupliquée côté client : on consomme la réponse de l'API (REC-2/D1).
import { ref, type Ref } from 'vue'
import { apiFetch } from '../utils/api'
import { buildSearchParams } from '../utils/stations'
import type { RecommendationRequest, Recommendation, RecommendationApiResponse } from '../utils/recommendation'

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
  /** Réinitialise l'état partagé (tests). */
  _reset: () => void
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
    // « Garder la dernière donnée » (keep previous data) : pendant le
    // chargement, on conserve la recommandation précédente au lieu de la
    // vider. Sinon, un pan de la carte relançait la recherche et le badge
    // « ★ Recommandée » (et la recommandation de la feuille) clignotait —
    // disparaissait puis réapparaissait à la réponse.
    state.value = {
      ...state.value,
      status: 'loading',
      error: null,
      startedAt: Date.now(),
      searchToken: String(myToken)
    }

    const result = await apiFetch<RecommendationApiResponse>(
      '/api/recommendation',
      buildSearchParams(request),
      { isStale: () => myToken !== token }
    )

    if (result.ok) {
      if (myToken !== token) return null
      const data = result.data.recommendation
      if (data.type === 'insufficient-data') {
        state.value = { ...EMPTY, status: 'empty', data, startedAt: Date.now(), searchToken: String(myToken) }
        return data
      }
      state.value = { ...EMPTY, status: 'success', data, startedAt: Date.now(), searchToken: String(myToken) }
      return data
    }

    if (result.error === 'stale' || myToken !== token) return null
    state.value = {
      ...state.value,
      status: 'error',
      error: result.error,
      startedAt: Date.now()
    }
    return null
  }

  function _reset() {
    state.value = { ...EMPTY }
    lastSearch.value = null
  }

  return { state, lastSearch, refresh, _reset }
}
