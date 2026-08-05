// tests/unit/use-fuel-recommendation.spec.ts — Test du composable
// useFuelRecommendation (ticket 010) : états chargement/erreur/succès/empty.
// L'API est simulée par un fetch stub (aucune règle métier testée ici —
// les scénarios §13 restent couverts au niveau du module pur).
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useFuelRecommendation } from '../../app/composables/useFuelRecommendation'
import type { Recommendation } from '../../app/utils/recommendation'

function makeRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    type: 'wait',
    confidence: 0.9,
    quantityToBuy: null,
    recommendedStation: null,
    referenceStation: {
      id: 'ref-1',
      name: 'Station ref',
      brand: null,
      address: '1 rue X',
      city: 'Paris',
      postalCode: '75001',
      position: { lat: 48.86, lon: 2.34 },
      fuel: 'Gazole',
      price: 2.0,
      updatedAt: '2026-08-03T08:00:00Z'
    },
    detourCost: null,
    grossSavings: null,
    netSavings: null,
    reasons: ['Aucun détour rentable pour l’instant.'],
    usedData: ['Prix officiels les plus récents pour ce carburant.'],
    ignoredData: [],
    calculations: [],
    assumptions: [],
    freshness: { ageInHours: 2, status: 'fresh', score: 1 },
    isPartial: false,
    ...overrides
  }
}

function installFetchMock(
  handler: (url: string) => Promise<Response>
) {
  const fetchMock = vi.fn(async (input: string) => handler(input))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('useFuelRecommendation (ticket 010)', () => {
  it('démarre à l’état idle sans donnée', () => {
    const reco = useFuelRecommendation()
    expect(reco.state.value.status).toBe('idle')
    expect(reco.state.value.data).toBeNull()
  })

  it('passe à l’état loading pendant la requête, puis success avec la recommandation', async () => {
    const reco = useFuelRecommendation()
    let resolveResponse: (r: Response) => void = () => {}
    installFetchMock(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve
        })
    )

    const pending = reco.refresh({
      radius: 10,
      fuel: 'Gazole',
      lat: 48.86,
      lon: 2.34
    })

    // La promesse n'est pas encore résolue : l'état est loading.
    expect(reco.state.value.status).toBe('loading')
    expect(reco.state.value.startedAt).not.toBeNull()

    resolveResponse(
      new Response(JSON.stringify({ recommendation: makeRecommendation() }), { status: 200 })
    )
    const result = await pending

    expect(reco.state.value.status).toBe('success')
    expect(reco.state.value.data?.type).toBe('wait')
    expect(result?.type).toBe('wait')
  })

  it('passe à l’état error avec un message compréhensible quand le serveur répond 500', async () => {
    const reco = useFuelRecommendation()
    installFetchMock(async () => {
      return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne' } }), {
        status: 500
      })
    })

    const result = await reco.refresh({ radius: 10, fuel: 'Gazole', city: 'Lyon' })

    expect(result).toBeNull()
    expect(reco.state.value.status).toBe('error')
    expect(reco.state.value.error).toBe('Erreur interne')
  })

  it('passe à l’état error sans inventer de donnée quand le réseau échoue', async () => {
    const reco = useFuelRecommendation()
    installFetchMock(async () => {
      throw new TypeError('fetch failed')
    })

    const result = await reco.refresh({ radius: 10, fuel: 'Gazole', postalCode: '69001' })

    expect(result).toBeNull()
    expect(reco.state.value.status).toBe('error')
    expect(reco.state.value.error).toMatch(/serveur|connexion/i)
    expect(reco.state.value.data).toBeNull()
  })

  it('passe à l’état empty pour une recommandation « Données insuffisantes »', async () => {
    const reco = useFuelRecommendation()
    const insufficient = makeRecommendation({ type: 'insufficient-data', isPartial: true, confidence: 0 })
    installFetchMock(async () => {
      return new Response(JSON.stringify({ recommendation: insufficient }), { status: 200 })
    })

    const result = await reco.refresh({ radius: 10, fuel: 'Gazole', city: 'Paris' })

    expect(reco.state.value.status).toBe('empty')
    expect(reco.state.value.data?.type).toBe('insufficient-data')
    expect(result?.type).toBe('insufficient-data')
  })

  it('construit une URL de requête correcte (lat/lon + radius + fuel)', async () => {
    const reco = useFuelRecommendation()
    let capturedUrl = ''
    installFetchMock(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({ recommendation: makeRecommendation() }), { status: 200 })
    })

    await reco.refresh({ radius: 20, fuel: 'SP95', lat: 48.86, lon: 2.34 })

    const url = new URL(capturedUrl, 'http://localhost')
    expect(url.pathname).toBe('/api/recommendation')
    expect(url.searchParams.get('lat')).toBe('48.86')
    expect(url.searchParams.get('lon')).toBe('2.34')
    expect(url.searchParams.get('radius')).toBe('20')
    expect(url.searchParams.get('fuel')).toBe('SP95')
  })

  it('envoie SP95-E10 sous sa valeur API E10 (le serveur rejette SP95-E10)', async () => {
    const reco = useFuelRecommendation()
    let capturedUrl = ''
    installFetchMock(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({ recommendation: makeRecommendation() }), { status: 200 })
    })

    await reco.refresh({ radius: 10, fuel: 'SP95-E10', city: 'Lyon' })

    const url = new URL(capturedUrl, 'http://localhost')
    expect(url.searchParams.get('fuel')).toBe('E10')
  })

  it('construit une URL ville/CP en mode sans géolocalisation (city / postalCode)', async () => {
    const reco = useFuelRecommendation()
    const urls: string[] = []
    installFetchMock(async (url) => {
      urls.push(url)
      return new Response(JSON.stringify({ recommendation: makeRecommendation() }), { status: 200 })
    })

    await reco.refresh({ radius: 10, fuel: 'Gazole', city: 'Lyon' })
    await reco.refresh({ radius: 30, fuel: 'Gazole', postalCode: '69001' })

    const cityUrl = new URL(urls[0]!, 'http://localhost')
    expect(cityUrl.searchParams.get('city')).toBe('Lyon')
    expect(cityUrl.searchParams.get('lat')).toBeNull()
    const cpUrl = new URL(urls[1]!, 'http://localhost')
    expect(cpUrl.searchParams.get('postalCode')).toBe('69001')
    expect(cpUrl.searchParams.get('q')).toBeNull()
  })
})
