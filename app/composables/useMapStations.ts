// composables/useMapStations.ts — Stations d'exploration de la carte (ticket
// 039, spec §8 GET /api/map/stations).
//
// Le magasin est CUMULATIF : les stations déjà chargées ne sont jamais retirées
// au déplacement de la carte. C'est tout l'objet du ticket — avant, panner
// relançait la recherche par rayon et les marqueurs de la zone quittée
// disparaissaient.
//
// Vidé en revanche au changement de CARBURANT : les prix stockés sont ceux d'un
// seul carburant, les garder afficherait des prix qui ne correspondent pas à ce
// que l'utilisateur a demandé (invariant « aucun prix inventé »).
//
// État partagé au niveau module (comme useStations) : la carte est unique.
import { computed, ref, type Ref } from 'vue'
import { apiFetch } from '../utils/api'
import { fuelToApi, type FuelValue } from '../utils/fuel'
import { BOUNDS_EXPANSION, expandBounds, isBoundsCovered } from '../utils/mapBounds'
import type { MapViewBounds } from '../utils/mapBounds'

// Miroir de MapStation (server/lib/map-stations.ts) : forme plate, minimale.
export interface MapStation {
  id: string
  lat: number
  lon: number
  price: number
  ageInHours: number
  status: 'fresh' | 'stale' | 'obsolete'
}

interface MapStationsPayload {
  stations: MapStation[]
}

export interface UseMapStationsReturn {
  stations: Ref<MapStation[]>
  loading: Ref<boolean>
  /** Charge l'emprise si elle n'est pas déjà couverte. Ne vide jamais rien. */
  load: (bounds: MapViewBounds, fuel: FuelValue) => Promise<void>
  /** Réinitialise le magasin (changement de carburant, tests). */
  reset: () => void
}

const store = ref(new Map<string, MapStation>())
const loadedBounds = ref<MapViewBounds[]>([])
const loading = ref(false)
let currentFuel: FuelValue | null = null
let inFlight = 0

function resetStore() {
  store.value = new Map()
  loadedBounds.value = []
}

export function useMapStations(): UseMapStationsReturn {
  const stations = computed(() => Array.from(store.value.values()))

  async function load(bounds: MapViewBounds, fuel: FuelValue): Promise<void> {
    // Changement de carburant : les prix en magasin ne sont plus ceux demandés.
    if (currentFuel !== fuel) {
      currentFuel = fuel
      resetStore()
    }

    // On charge plus large que le viewport, pour qu'un petit pan retombe dans
    // une zone déjà couverte et ne déclenche aucun appel.
    const target = expandBounds(bounds, BOUNDS_EXPANSION)
    if (isBoundsCovered(bounds, loadedBounds.value)) return

    const params = new URLSearchParams({
      swLat: String(target.swLat),
      swLon: String(target.swLon),
      neLat: String(target.neLat),
      neLon: String(target.neLon),
      fuel: fuelToApi(fuel)
    })

    const myFuel = fuel
    inFlight += 1
    loading.value = true
    try {
      const result = await apiFetch<MapStationsPayload>('/api/map/stations', params, {
        validate: (data) => Array.isArray(data?.stations)
      })
      // Le carburant a changé pendant le vol : ce résultat n'est plus celui
      // demandé, on le jette plutôt que d'afficher des prix d'un autre
      // carburant.
      if (currentFuel !== myFuel) return
      if (!result.ok) {
        // L'exploration est un CONFORT : un échec ne doit pas casser l'écran.
        // Les marqueurs déjà chargés restent, la recherche par rayon continue
        // de fonctionner. Rien n'est effacé, aucun message bloquant.
        return
      }
      // Fusion : jamais de remplacement. Une station déjà connue est mise à
      // jour (prix plus récent), les autres restent.
      const merged = new Map(store.value)
      for (const station of result.data.stations) {
        merged.set(station.id, station)
      }
      store.value = merged
      loadedBounds.value = [...loadedBounds.value, target]
    } finally {
      inFlight -= 1
      if (inFlight === 0) loading.value = false
    }
  }

  return { stations, loading, load, reset: resetStore }
}
