// tests/unit/autocomplete.spec.ts — Module pur de l'autocomplete de la
// recherche ville/adresse (ticket 025) : construction de l'URL api-adresse,
// parsing GeoJSON, choix du label/ville/CP, repli sur la valeur saisie.
// Aucune dépendance Nuxt/HTTP : tout est testable avec des objets simples.
//
// Ticket 031 : chaque suggestion porte aussi le centroïde renvoyé par le BAN
// (`geometry.coordinates`), pour que la recherche parte du point choisi et non
// d'un second géocodage serveur.
import { describe, expect, it } from 'vitest'
import {
  AUTOCOMPLETE_BASE_URL,
  AUTOCOMPLETE_LIMIT,
  buildAutocompleteUrl,
  buildLocationSelection,
  buildSearchQuery,
  parseAutocompleteResponse
} from '../../app/utils/autocomplete'
import type { AutocompleteSuggestion } from '../../app/utils/autocomplete'

// Suggestion complète, position incluse — base des cas de buildSearchQuery /
// buildLocationSelection.
function suggestion(overrides: Partial<AutocompleteSuggestion> = {}): AutocompleteSuggestion {
  return {
    label: 'Paris 75001',
    city: 'Paris',
    postalCode: '75001',
    context: '75, Paris, Île-de-France',
    position: { lat: 48.8566, lon: 2.3522 },
    ...overrides
  }
}

// ——— Fixture GeoJSON réaliste de https://api-adresse.data.gouv.fr/search ———
function municipalityFeature(
  overrides: Record<string, unknown> = {},
  geometry: unknown = { type: 'Point', coordinates: [2.3522, 48.8566] }
): unknown {
  return {
    type: 'Feature',
    geometry,
    properties: {
      label: 'Paris 75001',
      type: 'municipality',
      name: 'Paris',
      postcode: '75001',
      city: 'Paris',
      context: '75, Paris, Île-de-France',
      ...overrides
    }
  }
}

function featureCollection(features: unknown[]): unknown {
  return { type: 'FeatureCollection', version: 'draft', features }
}

describe('buildAutocompleteUrl (ticket 025)', () => {
  it('construit une URL api-adresse avec q et limit 6 par défaut', () => {
    const url = new URL(buildAutocompleteUrl('paris'))
    expect(url.origin + url.pathname).toBe(AUTOCOMPLETE_BASE_URL)
    expect(url.searchParams.get('q')).toBe('paris')
    expect(url.searchParams.get('limit')).toBe(String(AUTOCOMPLETE_LIMIT))
    expect(AUTOCOMPLETE_LIMIT).toBe(6)
  })

  it('permet de changer la limite', () => {
    const url = new URL(buildAutocompleteUrl('lyon', 10))
    expect(url.searchParams.get('limit')).toBe('10')
  })

  it('encode le texte saisi (espaces, accents) : la valeur survit à l’aller-retour', () => {
    const url = new URL(buildAutocompleteUrl('rue de la république'))
    expect(url.searchParams.get('q')).toBe('rue de la république')
    expect(url.search).not.toContain('rue de la république')
  })
})

describe('parseAutocompleteResponse (ticket 025)', () => {
  it('parse une FeatureCollection de municipalité : label, ville, CP, contexte', () => {
    const json = featureCollection([municipalityFeature()])
    const suggestions = parseAutocompleteResponse(json, 'paris')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toEqual({
      label: 'Paris 75001',
      city: 'Paris',
      postalCode: '75001',
      context: '75, Paris, Île-de-France',
      position: { lat: 48.8566, lon: 2.3522 }
    })
  })

  // Ticket 031 : la géométrie GeoJSON est [lon, lat] — l'inversion est le
  // piège classique et elle enverrait la recherche dans un autre pays.
  it('lit la position dans l’ordre GeoJSON [lon, lat]', () => {
    const json = featureCollection([
      municipalityFeature({}, { type: 'Point', coordinates: [-1.5536, 47.2184] })
    ])
    const [parsed] = parseAutocompleteResponse(json, 'nantes')
    expect(parsed?.position).toEqual({ lat: 47.2184, lon: -1.5536 })
  })

  it('position null quand la clé geometry est absente de la feature', () => {
    const json = featureCollection([
      { type: 'Feature', properties: { label: 'Paris 75001', city: 'Paris' } }
    ])
    const [parsed] = parseAutocompleteResponse(json, 'paris')
    expect(parsed?.label).toBe('Paris 75001')
    expect(parsed?.position).toBeNull()
  })

  it('position null quand la géométrie est malformée ou non numérique', () => {
    const cases: unknown[] = [
      null,
      { type: 'Point' },
      { type: 'Point', coordinates: [] },
      { type: 'Point', coordinates: [2.3522] },
      { type: 'Point', coordinates: ['2.3522', '48.8566'] },
      { type: 'Point', coordinates: [null, 48.8566] }
    ]
    for (const geometry of cases) {
      const json = featureCollection([municipalityFeature({}, geometry)])
      const [parsed] = parseAutocompleteResponse(json, 'paris')
      expect(parsed?.label).toBe('Paris 75001')
      expect(parsed?.position, JSON.stringify(geometry)).toBeNull()
    }
  })

  it('position null quand les coordonnées sortent des bornes terrestres', () => {
    const outOfRange = [
      [2.3522, 91],
      [2.3522, -91],
      [181, 48.8566],
      [-181, 48.8566]
    ]
    for (const coordinates of outOfRange) {
      const json = featureCollection([municipalityFeature({}, { type: 'Point', coordinates })])
      const [parsed] = parseAutocompleteResponse(json, 'paris')
      expect(parsed?.position, JSON.stringify(coordinates)).toBeNull()
    }
  })

  it('parse une adresse complète (housenumber)', () => {
    const json = featureCollection([
      municipalityFeature({
        label: '2 Rue de Rivoli, 75004 Paris',
        type: 'housenumber',
        city: 'Paris',
        postcode: '75004'
      })
    ])
    const [suggestion] = parseAutocompleteResponse(json, 'rivoli')
    expect(suggestion?.label).toBe('2 Rue de Rivoli, 75004 Paris')
    expect(suggestion?.city).toBe('Paris')
    expect(suggestion?.postalCode).toBe('75004')
  })

  it('replie le label sur la ville quand le label manque', () => {
    const json = featureCollection([municipalityFeature({ label: undefined })])
    const [suggestion] = parseAutocompleteResponse(json, 'paris')
    expect(suggestion?.label).toBe('Paris')
    expect(suggestion?.city).toBe('Paris')
  })

  it('retourne [] pour une réponse invalide ou sans features', () => {
    expect(parseAutocompleteResponse(null, 'x')).toEqual([])
    expect(parseAutocompleteResponse('pas du json', 'x')).toEqual([])
    expect(parseAutocompleteResponse({}, 'x')).toEqual([])
    expect(parseAutocompleteResponse({ features: 'pas-un-tableau' }, 'x')).toEqual([])
    expect(parseAutocompleteResponse(featureCollection([]), 'x')).toEqual([])
  })

  it('ignore les features malformées (ni label ni ville) sans inventer de donnée', () => {
    const json = featureCollection([
      municipalityFeature(),
      municipalityFeature({ label: undefined, city: undefined }),
      'garbage',
      null
    ])
    const suggestions = parseAutocompleteResponse(json, 'paris')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.city).toBe('Paris')
  })

  it('nettoie les espaces superflus et ignore les champs non-string', () => {
    const json = featureCollection([
      municipalityFeature({
        label: '  Paris 75001  ',
        city: ' Paris ',
        postcode: 75001,
        context: ['nimporte']
      })
    ])
    const [suggestion] = parseAutocompleteResponse(json, 'paris')
    expect(suggestion?.label).toBe('Paris 75001')
    expect(suggestion?.city).toBe('Paris')
    expect(suggestion?.postalCode).toBe('')
    expect(suggestion?.context).toBe('')
  })
})

describe('buildSearchQuery (ticket 025)', () => {
  it('ville + CP → la chaîne ville CP, la plus robuste pour le géocodage serveur', () => {
    expect(buildSearchQuery(suggestion(), 'paris')).toBe('Paris 75001')
  })

  it('ville seule → la ville', () => {
    expect(
      buildSearchQuery(
        suggestion({ label: 'Lyon', city: 'Lyon', postalCode: '', context: '69, Rhône' }),
        'lyon'
      )
    ).toBe('Lyon')
  })

  it('adresse sans ville → le label complet', () => {
    expect(
      buildSearchQuery(
        suggestion({ label: '2 Rue de Rivoli, 75004 Paris', city: '', postalCode: '75004' }),
        'rivoli'
      )
    ).toBe('2 Rue de Rivoli, 75004 Paris')
  })

  it('repli sur la valeur saisie quand la suggestion ne porte rien d’utilisable', () => {
    expect(buildSearchQuery(null, 'paris 75')).toBe('paris 75')
    const empty = suggestion({ label: '', city: '', postalCode: '', context: '' })
    expect(buildSearchQuery(empty, 'paris 75')).toBe('paris 75')
  })
})

// ——— Ticket 031 : la sélection porte le texte ET le centre choisi ———
describe('buildLocationSelection (ticket 031)', () => {
  it('reprend exactement le texte de buildSearchQuery et y joint la position', () => {
    const chosen = suggestion()
    expect(buildLocationSelection(chosen, 'paris')).toEqual({
      query: buildSearchQuery(chosen, 'paris'),
      position: { lat: 48.8566, lon: 2.3522 }
    })
  })

  it('position null quand la suggestion n’en porte pas : le serveur géocodera le texte', () => {
    expect(buildLocationSelection(suggestion({ position: null }), 'paris')).toEqual({
      query: 'Paris 75001',
      position: null
    })
  })

  it('sans suggestion (saisie libre), le texte brut part seul', () => {
    expect(buildLocationSelection(null, '  paris 75  ')).toEqual({
      query: '  paris 75  ',
      position: null
    })
  })

  it('une suggestion vide replie sur la saisie, sans position inventée', () => {
    const empty = suggestion({ label: '', city: '', postalCode: '', position: null })
    expect(buildLocationSelection(empty, 'paris 75')).toEqual({
      query: 'paris 75',
      position: null
    })
  })

  // Le texte reste utilisable même quand la position est connue : il sert au
  // libellé « Recherche autour de … » et à la mémorisation locale (LOC-2).
  it('le texte est toujours fourni, même avec une position', () => {
    const result = buildLocationSelection(suggestion(), 'par')
    expect(result.query).not.toBe('')
    expect(result.position).not.toBeNull()
  })
})
