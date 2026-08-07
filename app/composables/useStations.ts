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
import { apiFetch } from '../utils/api'
import { buildSearchParams, type StationsRequest, type StationsQueryResult } from '../utils/stations'

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
  /** Réinitialise l'état partagé (tests). */
  _reset: () => void
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
    // « Garder la dernière donnée » (keep previous data) : pendant le
    // chargement, on conserve les stations de la recherche précédente au lieu
    // de les vider. Sinon, un pan de la carte (qui relance la recherche)
    // faisait disparaître tous les marqueurs pendant le réseau, puis les
    // refaisait réapparaître à la réponse (demande produit : les marqueurs ne
    // doivent pas disparaître pendant un déplacement).
    state.value = {
      ...state.value,
      status: 'loading',
      error: null,
      startedAt: Date.now(),
      searchToken: String(myToken)
    }

    const result = await apiFetch<StationsQueryResult>(
      '/api/stations',
      buildSearchParams(request),
      {
        isStale: () => myToken !== token,
        validate: (data) => Array.isArray(data.stations)
      }
    )

    if (result.ok) {
      if (myToken !== token) return null
      state.value = { ...EMPTY, status: 'success', data: result.data, startedAt: Date.now(), searchToken: String(myToken) }
      return result.data
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
