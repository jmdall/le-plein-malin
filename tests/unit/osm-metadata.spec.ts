// tests/unit/osm-metadata.spec.ts — Provider OSM de métadonnées d'identité
// (ticket 018). Fixtures = réponse Overpass typique vérifiée réellement
// (ref:FR:prix-carburants ↔ brand/name/brand:wikidata), aucune requête réseau
// (fetch mocké). Aucun prix touché : le provider ne produit que des
// métadonnées d'identité.
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createOsmMetadataProvider,
  buildLogoUrl,
  parseOverpassResponse
} from '../../server/providers/osmMetadata'
import { OSM_METADATA_SOURCE_NAME } from '../../server/providers'

// ——— Fixtures : réponse Overpass typique (données réelles vérifiées) ———

// Station 1000012 = Total, brand:wikidata Q154037, nom « Total ».
const FIXTURE_TOTAL = {
  type: 'node',
  id: 25178159,
  tags: {
    amenity: 'fuel',
    brand: 'Total',
    'brand:wikidata': 'Q154037',
    name: 'Relais Total De La Grande Borne',
    'ref:FR:prix-carburants': '91170006'
  }
}

// Station avec enseigne + nom (Esso, Q867662).
const FIXTURE_ESSO = {
  type: 'node',
  id: 25178354,
  tags: {
    amenity: 'fuel',
    brand: 'Esso',
    'brand:wikidata': 'Q867662',
    name: 'Esso',
    'ref:FR:prix-carburants': '77400012'
  }
}

// Station sans marque ni nom (seulement l'id).
const FIXTURE_NO_BRAND = {
  type: 'node',
  id: 25178355,
  tags: {
    amenity: 'fuel',
    'ref:FR:prix-carburants': '99999999'
  }
}

function overpassResponse(elements: unknown[]): Response {
  return new Response(JSON.stringify({ elements }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

function wikidataResponse(id: string, filename: string): Response {
  return new Response(
    JSON.stringify({
      entities: {
        [id]: {
          claims: {
            P154: [{ mainsnak: { datavalue: { value: filename } } }]
          }
        }
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

// Fetch mocké : la première URL est Overpass, les suivantes Wikidata.
function mockFetchFor(
  overpassElements: unknown[],
  wikidataMap: Record<string, string>
) {
  let overpassServed = false
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (!overpassServed) {
      overpassServed = true
      return overpassResponse(overpassElements)
    }
    const id = decodeURIComponent(url.split('/').pop() ?? '').replace(/\.json$/, '')
    const filename = wikidataMap[id]
    return filename
      ? wikidataResponse(id, filename)
      : new Response('{"entities":{}}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
  })
  return fetchFn
}

function wikimediaUrlFor(filename: string): string {
  const underscored = filename.replace(/\s+/g, '_')
  const hash = createHash('md5').update(underscored).digest('hex')
  return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(underscored)}`
}

describe('osm-metadata provider', () => {
  it('expose son nom et sa source (attribution ODbL)', () => {
    const provider = createOsmMetadataProvider()
    expect(provider.name).toBe('osm-metadata')
    expect(provider.sourceName).toBe(OSM_METADATA_SOURCE_NAME)
  })

  it('retourne les métadonnées par id avec logo résolu best-effort', async () => {
    const fetchFn = mockFetchFor(
      [FIXTURE_TOTAL, FIXTURE_ESSO],
      { Q154037: 'Total wordmark (2003-2021).svg', Q867662: 'Esso textlogo.svg' }
    )
    const provider = createOsmMetadataProvider({ fetchFn })

    const result = await provider.findMetadataFor(['91170006', '77400012'])

    expect(fetchFn).toHaveBeenCalledTimes(3) // 1 Overpass + 2 Wikidata

    const byId = new Map(result.map((m) => [m.id, m]))
    expect(byId.size).toBe(2)

    const total = byId.get('91170006')!
    expect(total).toEqual({
      id: '91170006',
      name: 'Relais Total De La Grande Borne',
      brand: 'Total',
      brandWikidataId: 'Q154037',
      logoUrl: wikimediaUrlFor('Total wordmark (2003-2021).svg')
    })

    const esso = byId.get('77400012')!
    expect(esso).toEqual({
      id: '77400012',
      name: 'Esso',
      brand: 'Esso',
      brandWikidataId: 'Q867662',
      logoUrl: wikimediaUrlFor('Esso textlogo.svg')
    })
  })

  it('station sans marque → champs nuls, logo null sans appel Wikidata', async () => {
    const fetchFn = mockFetchFor([FIXTURE_NO_BRAND], {})
    const provider = createOsmMetadataProvider({ fetchFn })

    const result = await provider.findMetadataFor(['99999999'])

    expect(fetchFn).toHaveBeenCalledTimes(1) // pas d'appel Wikidata
    expect(result).toEqual([
      {
        id: '99999999',
        name: null,
        brand: null,
        brandWikidataId: null,
        logoUrl: null
      }
    ])
  })

  it('réponse Overpass vide → []', async () => {
    const provider = createOsmMetadataProvider({
      fetchFn: mockFetchFor([], {})
    })
    expect(await provider.findMetadataFor(['11111111'])).toEqual([])
  })

  it('requête vide → [] sans aucun fetch', async () => {
    const fetchFn = vi.fn()
    const provider = createOsmMetadataProvider({ fetchFn })
    expect(await provider.findMetadataFor([])).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('échec réseau Overpass → [] (jamais d\'exception)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'))
    const provider = createOsmMetadataProvider({ fetchFn })
    expect(await provider.findMetadataFor(['91170006'])).toEqual([])
  })

  it('HTTP 500 Overpass → [] (jamais d\'exception)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500 })
    )
    const provider = createOsmMetadataProvider({ fetchFn })
    expect(await provider.findMetadataFor(['91170006'])).toEqual([])
  })

  it('JSON Overpass invalide → []', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('pas du json', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const provider = createOsmMetadataProvider({ fetchFn })
    expect(await provider.findMetadataFor(['91170006'])).toEqual([])
  })

  it('Wikidata indisponible → logo null, métadonnées conservées', async () => {
    // Le 2e appel (Wikidata) échoue : on écarte le mock du scénario normal.
    const failing = vi
      .fn()
      .mockResolvedValueOnce(overpassResponse([FIXTURE_TOTAL]))
      .mockRejectedValueOnce(new Error('wikidata down'))
    const provider = createOsmMetadataProvider({ fetchFn: failing })

    const result = await provider.findMetadataFor(['91170006'])

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('91170006')
    expect(result[0]!.brand).toBe('Total')
    expect(result[0]!.brandWikidataId).toBe('Q154037')
    expect(result[0]!.logoUrl).toBeNull()
  })

  it('Wikidata sans P154 → logo null', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(overpassResponse([FIXTURE_TOTAL]))
      .mockResolvedValueOnce(
        new Response('{"entities":{"Q154037":{"claims":{}}}}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    const provider = createOsmMetadataProvider({ fetchFn })

    const result = await provider.findMetadataFor(['91170006'])
    expect(result[0]!.logoUrl).toBeNull()
  })

  it('déduplique les ids : requête groupée, un seul résultat par id', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(overpassResponse([FIXTURE_ESSO, FIXTURE_ESSO]))
      .mockResolvedValueOnce(wikidataResponse('Q867662', 'Esso textlogo.svg'))
    const provider = createOsmMetadataProvider({ fetchFn })

    const result = await provider.findMetadataFor(['77400012', '77400012'])

    expect(result).toHaveLength(1)
  })

  it('la requête Overpass est groupée : les ids en valeurs (NFR-PERF-2)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(overpassResponse([]))
    const provider = createOsmMetadataProvider({ fetchFn })

    await provider.findMetadataFor(['91170006', '77400012', '99999999'])

    const call = fetchFn.mock.calls[0]!
    const input = call[0]
    const init = call[1] as RequestInit
    expect(init?.method).toBe('POST')
    const body = (init?.body as string) ?? ''
    expect(decodeURIComponent(body)).toContain(
      '"ref:FR:prix-carburants"~"^(91170006|77400012|99999999)$"'
    )
    expect(input).toBe('https://overpass-api.de/api/interpreter')
  })
})

describe('buildLogoUrl (résolution logo Wikimedia)', () => {
  it('construit une URL stable vérifiée (Total)', () => {
    // Vérifié réellement : commons/e/ed/Total_wordmark_(2003-2021).svg → HTTP 200.
    expect(buildLogoUrl('Total wordmark (2003-2021).svg')).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/e/ed/Total_wordmark_(2003-2021).svg'
    )
  })

  it('construit une URL stable vérifiée (Esso)', () => {
    // Vérifié réellement : commons/2/22/Esso_textlogo.svg → HTTP 200.
    expect(buildLogoUrl('Esso textlogo.svg')).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/2/22/Esso_textlogo.svg'
    )
  })

  it('échoue proprement sur entrée invalide → null', () => {
    expect(buildLogoUrl('')).toBeNull()
    expect(buildLogoUrl('   ')).toBeNull()
    expect(buildLogoUrl('File:Total.svg')).toBeNull() // préfixe File: interdit
    expect(buildLogoUrl('../etc/passwd')).toBeNull() // chemin, pas un nom
  })
})

describe('parseOverpassResponse', () => {
  it('ignore les éléments sans ref:FR:prix-carburants et sans tags', () => {
    const parsed = parseOverpassResponse({
      elements: [
        FIXTURE_TOTAL,
        { type: 'node', id: 42, tags: { amenity: 'fuel' } },
        { type: 'way', id: 43, tags: { 'ref:FR:prix-carburants': 'bad' } },
        { type: 'node', id: 44, tags: {} }
      ]
    })
    expect(parsed).toEqual([
      {
        id: '91170006',
        name: 'Relais Total De La Grande Borne',
        brand: 'Total',
        brandWikidataId: 'Q154037',
        logoUrl: null
      }
    ])
  })

  it('déduplique les doublons (premier élément gagne)', () => {
    const a = { ...FIXTURE_TOTAL }
    const b = {
      ...FIXTURE_TOTAL,
      id: 999,
      tags: { ...FIXTURE_TOTAL.tags, name: 'Doublon' }
    }
    const parsed = parseOverpassResponse({ elements: [a, b] })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.name).toBe('Relais Total De La Grande Borne')
  })
})
