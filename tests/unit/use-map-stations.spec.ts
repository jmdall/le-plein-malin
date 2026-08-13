// tests/unit/use-map-stations.spec.ts — Magasin d'exploration de la carte
// (ticket 039). Ce qui compte ici : le magasin est CUMULATIF (panner n'efface
// rien — c'est tout l'objet du ticket), et il ne redemande pas une zone déjà
// couverte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMapStations } from '../../app/composables/useMapStations'
import type { MapStation } from '../../app/composables/useMapStations'
import type { MapViewBounds } from '../../app/utils/mapBounds'

const PARIS: MapViewBounds = { swLat: 48.8, swLon: 2.2, neLat: 48.9, neLon: 2.4 }
const LYON: MapViewBounds = { swLat: 45.7, swLon: 4.75, neLat: 45.8, neLon: 4.9 }

function station(id: string, overrides: Partial<MapStation> = {}): MapStation {
  return { id, lat: 48.85, lon: 2.35, price: 1.8, ageInHours: 3, status: 'fresh', ...overrides }
}

let calls: string[]

function mockFetch(responder: (url: string) => unknown) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url))
      return {
        ok: true,
        status: 200,
        json: async () => responder(String(url))
      } as unknown as Response
    })
  )
}

beforeEach(() => {
  useMapStations().reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMapStations (ticket 039)', () => {
  it('charge une emprise et expose les stations', async () => {
    mockFetch(() => ({ stations: [station('a'), station('b')] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    expect(map.stations.value.map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(calls).toHaveLength(1)
  })

  it('transmet l’emprise ÉLARGIE et le carburant', async () => {
    mockFetch(() => ({ stations: [] }))
    await useMapStations().load(PARIS, 'SP95-E10')
    const params = new URL(calls[0]!, 'http://x').searchParams
    // Élargie : le sud est plus au sud que l'emprise demandée.
    expect(Number(params.get('swLat'))).toBeLessThan(PARIS.swLat)
    expect(Number(params.get('neLat'))).toBeGreaterThan(PARIS.neLat)
    // fuelToApi : SP95-E10 → E10.
    expect(params.get('fuel')).toBe('E10')
  })

  // Le cœur du ticket : panner n'efface RIEN.
  it('cumule les zones : charger Lyon ne fait pas disparaître Paris', async () => {
    mockFetch((url) =>
      url.includes('45.7') || url.includes('45.') ? { stations: [station('lyon')] } : { stations: [station('paris')] }
    )
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    await map.load(LYON, 'Gazole')
    expect(map.stations.value.map((s) => s.id).sort()).toEqual(['lyon', 'paris'])
  })

  it('ne redemande pas une zone déjà couverte (pan à l’intérieur)', async () => {
    mockFetch(() => ({ stations: [station('a')] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    expect(calls).toHaveLength(1)

    // Petit pan à l'intérieur de l'emprise élargie déjà chargée.
    await map.load({ swLat: 48.81, swLon: 2.21, neLat: 48.89, neLon: 2.39 }, 'Gazole')
    expect(calls).toHaveLength(1)
  })

  it('redemande quand on dézoome au-delà de ce qui est chargé', async () => {
    mockFetch(() => ({ stations: [station('a')] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    await map.load({ swLat: 41, swLon: -5.5, neLat: 51.5, neLon: 9.8 }, 'Gazole')
    expect(calls).toHaveLength(2)
  })

  it('met à jour une station déjà connue sans perdre les autres', async () => {
    let round = 0
    mockFetch(() => {
      round += 1
      return round === 1
        ? { stations: [station('a', { price: 1.9 }), station('b')] }
        : { stations: [station('a', { price: 1.75 })] }
    })
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    await map.load(LYON, 'Gazole')
    const byId = new Map(map.stations.value.map((s) => [s.id, s]))
    expect(byId.get('a')!.price).toBe(1.75)
    expect(byId.get('b')).toBeDefined()
  })

  // Les prix stockés sont ceux d'UN carburant : les garder afficherait des prix
  // qui ne correspondent pas à ce que l'utilisateur a demandé.
  it('vide le magasin au changement de carburant', async () => {
    mockFetch((url) =>
      url.includes('fuel=E10') ? { stations: [station('e10')] } : { stations: [station('gazole')] }
    )
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    expect(map.stations.value.map((s) => s.id)).toEqual(['gazole'])

    await map.load(PARIS, 'SP95-E10')
    expect(map.stations.value.map((s) => s.id)).toEqual(['e10'])
  })

  it('le changement de carburant réarme aussi la couverture', async () => {
    mockFetch(() => ({ stations: [] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    await map.load(PARIS, 'Gazole')
    expect(calls).toHaveLength(1)
    // Même emprise, autre carburant : il FAUT redemander.
    await map.load(PARIS, 'SP98')
    expect(calls).toHaveLength(2)
  })

  // L'exploration est un confort : un échec ne doit pas casser l'écran.
  it('un échec réseau n’efface rien et ne lève pas', async () => {
    mockFetch(() => ({ stations: [station('a')] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('réseau coupé')
      })
    )
    await expect(map.load(LYON, 'Gazole')).resolves.toBeUndefined()
    // Les marqueurs déjà chargés restent.
    expect(map.stations.value.map((s) => s.id)).toEqual(['a'])
  })

  it('une réponse invalide n’efface rien', async () => {
    mockFetch(() => ({ stations: [station('a')] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')

    mockFetch(() => ({ pasDesStations: true }))
    await map.load(LYON, 'Gazole')
    expect(map.stations.value.map((s) => s.id)).toEqual(['a'])
  })

  it('une zone en échec n’est pas marquée comme couverte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('réseau coupé')
      })
    )
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')

    // Le réseau revient : la même zone doit être redemandée.
    mockFetch(() => ({ stations: [station('a')] }))
    await map.load(PARIS, 'Gazole')
    expect(calls).toHaveLength(1)
    expect(map.stations.value.map((s) => s.id)).toEqual(['a'])
  })

  it('reset vide le magasin et la couverture', async () => {
    mockFetch(() => ({ stations: [station('a')] }))
    const map = useMapStations()
    await map.load(PARIS, 'Gazole')
    map.reset()
    expect(map.stations.value).toEqual([])
    await map.load(PARIS, 'Gazole')
    expect(calls).toHaveLength(2)
  })
})
