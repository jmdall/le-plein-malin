// tests/unit/autocomplete.spec.ts — Module pur de l'autocomplete de la
// recherche ville/adresse (ticket 025) : construction de l'URL api-adresse,
// parsing GeoJSON, choix du label/ville/CP, repli sur la valeur saisie.
// Aucune dépendance Nuxt/HTTP : tout est testable avec des objets simples.
import { describe, expect, it } from 'vitest'
import {
  AUTOCOMPLETE_BASE_URL,
  AUTOCOMPLETE_LIMIT,
  buildAutocompleteUrl,
  buildSearchQuery,
  parseAutocompleteResponse
} from '../../app/utils/autocomplete'
import type { AutocompleteSuggestion } from '../../app/utils/autocomplete'

// ——— Fixture GeoJSON réaliste de https://api-adresse.data.gouv.fr/search ———
function municipalityFeature(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
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
      context: '75, Paris, Île-de-France'
    })
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
    const suggestion: AutocompleteSuggestion = {
      label: 'Paris 75001',
      city: 'Paris',
      postalCode: '75001',
      context: '75, Paris, Île-de-France'
    }
    expect(buildSearchQuery(suggestion, 'paris')).toBe('Paris 75001')
  })

  it('ville seule → la ville', () => {
    const suggestion: AutocompleteSuggestion = {
      label: 'Lyon',
      city: 'Lyon',
      postalCode: '',
      context: '69, Rhône, Auvergne-Rhône-Alpes'
    }
    expect(buildSearchQuery(suggestion, 'lyon')).toBe('Lyon')
  })

  it('adresse sans ville → le label complet', () => {
    const suggestion: AutocompleteSuggestion = {
      label: '2 Rue de Rivoli, 75004 Paris',
      city: '',
      postalCode: '75004',
      context: ''
    }
    expect(buildSearchQuery(suggestion, 'rivoli')).toBe('2 Rue de Rivoli, 75004 Paris')
  })

  it('repli sur la valeur saisie quand la suggestion ne porte rien d’utilisable', () => {
    expect(buildSearchQuery(null, 'paris 75')).toBe('paris 75')
    const empty: AutocompleteSuggestion = { label: '', city: '', postalCode: '', context: '' }
    expect(buildSearchQuery(empty, 'paris 75')).toBe('paris 75')
  })
})
