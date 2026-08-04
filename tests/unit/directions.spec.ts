// tests/unit/directions.spec.ts — Liens d'itinéraire (OSM par défaut, Waze,
// Google Maps en alternatives). URLs publiques sans clé, aucun service payant
// (spec §4 #7, D3/ADR-0002).
import { describe, expect, it } from 'vitest'
import { buildDirectionsUrl, buildDirectionsLinks } from '../../utils/location'

const POSITION = { lat: 48.8566, lon: 2.3522 }

describe('buildDirectionsUrl (OSM)', () => {
  it('construit une URL OSM directions avec les coordonnées', () => {
    const url = buildDirectionsUrl(POSITION)
    expect(url).toMatch(/^https:\/\/www\.openstreetmap\.org\/directions\?/)
    expect(url).toContain('route=48.856600%2C2.352200')
  })
})

describe('buildDirectionsLinks', () => {
  it('retourne les trois destinations avec les coordonnées exactes', () => {
    const links = buildDirectionsLinks(POSITION)
    expect(links.osm).toContain('openstreetmap.org/directions')
    // OSM encode la virgule (%2C, voir buildDirectionsUrl testé ci-dessus).
    expect(decodeURIComponent(links.osm)).toContain('route=48.856600,2.352200')
    expect(links.waze).toContain('waze.com/ul')
    expect(links.waze).toContain('ll=48.856600,2.352200')
    expect(links.waze).toContain('navigate=yes')
    expect(links.googleMaps).toContain('google.com/maps/dir')
    expect(links.googleMaps).toContain('destination=48.856600,2.352200')
  })

  it('ne contient aucune clé API (aucun service payant)', () => {
    const links = buildDirectionsLinks(POSITION)
    for (const url of Object.values(links)) {
      expect(url).not.toMatch(/[?&](key|apiKey|token)=/i)
    }
  })
})
