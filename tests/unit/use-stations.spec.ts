// tests/unit/use-stations.spec.ts — Test du composable useStations (ticket
// 011) : états chargement/erreur/succès, URL de requête identique à la
// recommandation (même position/rayon/carburant). L'API est simulée par un
// fetch stub — aucune règle métier testée ici.
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useStations } from '../../app/composables/useStations'
import type { ListedStation } from '../../app/utils/stations'

function makeStation(id: string, overrides: Partial<ListedStation> = {}): ListedStation {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    address: '1 rue X',
    city: 'Paris',
    postalCode: '75001',
    position: { lat: 48.86, lon: 2.34 },
    fuel: 'Gazole',
    price: 2.0,
    updatedAt: '2026-08-03T08:00:00Z',
    distanceKm: 5,
    isReference: false,
    economics: { detourCost: 0.5, grossSavings: 2, netSavings: 1.5 },
    attractiveness: null,
    freshness: { ageInHours: 2, status: 'fresh', score: 1 },
    ...overrides
  }
}

function installFetchMock(handler: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn(async (input: string) => handler(input))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
  useStations()._reset()
})

describe('useStations (ticket 011)', () => {
  it('démarre à l’état idle sans donnée', () => {
    const s = useStations()
    expect(s.state.value.status).toBe('idle')
    expect(s.state.value.data).toBeNull()
  })

  it('passe à loading puis success avec la liste', async () => {
    const s = useStations()
    let resolveResponse: (r: Response) => void = () => {}
    installFetchMock(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve
        })
    )

    const pending = s.refresh({ radius: 10, fuel: 'Gazole', lat: 48.86, lon: 2.34 })
    expect(s.state.value.status).toBe('loading')

    resolveResponse(
      new Response(
        JSON.stringify({
          stations: [makeStation('a')],
          referenceStation: makeStation('ref', { isReference: true }),
          query: { center: { lat: 48.86, lon: 2.34 }, radius: 10, fuel: 'Gazole' }
        }),
        { status: 200 }
      )
    )
    const result = await pending

    expect(s.state.value.status).toBe('success')
    expect(result?.stations).toHaveLength(1)
    expect(s.state.value.data?.query.fuel).toBe('Gazole')
  })

  it('passe à error avec un message compréhensible sur erreur serveur', async () => {
    const s = useStations()
    installFetchMock(async () => {
      return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne' } }), {
        status: 500
      })
    })

    const result = await s.refresh({ radius: 10, fuel: 'Gazole', city: 'Lyon' })

    expect(result).toBeNull()
    expect(s.state.value.status).toBe('error')
    expect(s.state.value.error).toBe('Erreur interne')
  })

  it('passe à error sans inventer de donnée quand le réseau échoue', async () => {
    const s = useStations()
    installFetchMock(async () => {
      throw new TypeError('fetch failed')
    })

    const result = await s.refresh({ radius: 10, fuel: 'Gazole', postalCode: '69001' })

    expect(result).toBeNull()
    expect(s.state.value.status).toBe('error')
    expect(s.state.value.error).toMatch(/serveur|connexion/i)
    expect(s.state.value.data).toBeNull()
  })

  it('construit une URL /api/stations avec les mêmes paramètres que la recommandation', async () => {
    const s = useStations()
    let capturedUrl = ''
    installFetchMock(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({ stations: [], referenceStation: null }), { status: 200 })
    })

    await s.refresh({ radius: 20, fuel: 'SP95', lat: 48.86, lon: 2.34 })

    const url = new URL(capturedUrl, 'http://localhost')
    expect(url.pathname).toBe('/api/stations')
    expect(url.searchParams.get('lat')).toBe('48.86')
    expect(url.searchParams.get('lon')).toBe('2.34')
    expect(url.searchParams.get('radius')).toBe('20')
    expect(url.searchParams.get('fuel')).toBe('SP95')
  })

  it('envoie SP95-E10 sous sa valeur API E10 (le serveur rejette SP95-E10)', async () => {
    const s = useStations()
    let capturedUrl = ''
    installFetchMock(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({ stations: [], referenceStation: null }), { status: 200 })
    })

    await s.refresh({ radius: 10, fuel: 'SP95-E10', city: 'Lyon' })

    const url = new URL(capturedUrl, 'http://localhost')
    expect(url.searchParams.get('fuel')).toBe('E10')
  })

  it('construit une URL ville/CP en mode sans géolocalisation', async () => {
    const s = useStations()
    const urls: string[] = []
    installFetchMock(async (url) => {
      urls.push(url)
      return new Response(JSON.stringify({ stations: [], referenceStation: null }), { status: 200 })
    })

    await s.refresh({ radius: 10, fuel: 'Gazole', city: 'Lyon' })
    const url = new URL(urls[0]!, 'http://localhost')
    expect(url.searchParams.get('city')).toBe('Lyon')
    expect(url.searchParams.get('lat')).toBeNull()
  })

  it('garde les stations précédentes pendant le chargement (pas de disparition des marqueurs)', async () => {
    const s = useStations()
    const first = new Response(
      JSON.stringify({
        stations: [makeStation('a')],
        referenceStation: null,
        query: { center: { lat: 48.86, lon: 2.34 }, radius: 10, fuel: 'Gazole' }
      }),
      { status: 200 }
    )
    let resolveSecond: (r: Response) => void = () => {}
    let call = 0
    installFetchMock(async () => {
      call += 1
      if (call === 1) return first
      return new Promise((resolve) => {
        resolveSecond = resolve
      })
    })

    await s.refresh({ radius: 10, fuel: 'Gazole', lat: 48.86, lon: 2.34 })
    expect(s.state.value.status).toBe('success')
    expect(s.state.value.data?.stations).toHaveLength(1)

    // Nouvelle recherche (pan de la carte) : pendant le chargement, les
    // données précédentes restent disponibles — la carte garde ses marqueurs.
    const pending = s.refresh({ radius: 10, fuel: 'Gazole', lat: 48.9, lon: 2.4 })
    expect(s.state.value.status).toBe('loading')
    expect(s.state.value.data?.stations).toHaveLength(1)

    resolveSecond(
      new Response(
        JSON.stringify({
          stations: [makeStation('b')],
          referenceStation: null,
          query: { center: { lat: 48.9, lon: 2.4 }, radius: 10, fuel: 'Gazole' }
        }),
        { status: 200 }
      )
    )
    await pending
    expect(s.state.value.data?.stations[0]?.id).toBe('b')
  })

  it('une réponse sans tableau stations est traitée comme invalide (erreur, pas de donnée inventée)', async () => {
    const s = useStations()
    installFetchMock(async () => {
      return new Response(JSON.stringify({ stations: 'pas-un-tableau' }), { status: 200 })
    })

    const result = await s.refresh({ radius: 10, fuel: 'Gazole', q: 'Paris' })

    expect(result).toBeNull()
    expect(s.state.value.status).toBe('error')
    expect(s.state.value.data).toBeNull()
  })
})
