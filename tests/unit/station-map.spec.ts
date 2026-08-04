// tests/unit/station-map.spec.ts — Présentation de la carte (ticket 012,
// spec §4 step 4). Module client pur : aucune dépendance Leaflet. Vérifie le
// centre/zoom choisis, les marqueurs (référence repérée pour le style
// non-hiérarchique NFR-ACC-4) et le contenu de la popup (nom, prix, distance,
// fraîcheur, lien itinéraire OSM — pas de service payant).
import { describe, expect, it } from 'vitest'
import { buildStationMapView, buildPopupHtml, escapeHtml, MAP_START_ZOOM } from '../../utils/stationMap'
import type { ListedStation } from '../../utils/stations'

function station(id: string, overrides: Partial<ListedStation> = {}): ListedStation {
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
    distanceKm: 1.2,
    isReference: false,
    economics: { detourCost: 0.5, grossSavings: 2, netSavings: 1.5 },
    freshness: { ageInHours: 2, status: 'fresh', score: 1 },
    ...overrides
  }
}

describe('buildStationMapView (ticket 012)', () => {
  it('centre la carte sur query.center fourni par l’API', () => {
    const view = buildStationMapView(
      [station('a'), station('b')],
      station('ref', { id: 'ref', isReference: true }),
      { lat: 48.86, lon: 2.35 }
    )
    expect(view.center).toEqual({ lat: 48.86, lon: 2.35, zoom: MAP_START_ZOOM })
  })

  it('replie sur la station de référence, puis sur le centroïde quand center manque', () => {
    const ref = station('ref', { id: 'ref', isReference: true, position: { lat: 48.87, lon: 2.36 } })
    const withRef = buildStationMapView([station('a'), ref], ref, null)
    expect(withRef.center).toMatchObject({ lat: 48.87, lon: 2.36 })

    const only = buildStationMapView([station('a', { position: { lat: 48.9, lon: 2.4 } })], null, null)
    expect(only.center).toMatchObject({ lat: 48.9, lon: 2.4 })
  })

  it('sans station ni centre → center null (pas de carte positionnable)', () => {
    const view = buildStationMapView([], null, null)
    expect(view.center).toBeNull()
    expect(view.markers).toHaveLength(0)
  })

  it('produit un marqueur par station avec la référence repérée (NFR-ACC-4)', () => {
    const view = buildStationMapView(
      [station('a'), station('ref', { id: 'ref', isReference: true })],
      station('ref', { id: 'ref', isReference: true }),
      { lat: 48.86, lon: 2.34 }
    )
    expect(view.markers).toHaveLength(2)
    const ref = view.markers.find((m) => m.id === 'ref')
    expect(ref?.isReference).toBe(true)
    const a = view.markers.find((m) => m.id === 'a')
    expect(a?.isReference).toBe(false)
    expect(a?.lat).toBe(48.86)
    expect(a?.lon).toBe(2.34)
  })

  it('portent le logo validé (https, wikimedia) et rejettent les URL arbitraires (021)', () => {
    const ok = 'https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg'
    const evil = 'https://evil.example.com/x.png'
    const view = buildStationMapView(
      [
        station('a', { brand: 'Total', logoUrl: ok }),
        station('b', { brand: 'Total', logoUrl: evil }),
        station('c', { brand: null, logoUrl: null })
      ],
      null,
      null
    )
    const byId = (id: string) => view.markers.find((m) => m.id === id)!
    expect(byId('a').logoUrl).toBe(ok)
    expect(byId('b').logoUrl).toBeNull()
    expect(byId('c').logoUrl).toBeNull()
  })
})

describe('buildPopupHtml (ticket 012 + 021)', () => {
  const marker = buildStationMapView([station('a')], null, { lat: 48.86, lon: 2.34 }).markers[0]!

  it('contient nom, prix, distance, fraîcheur et lien itinéraire OSM', () => {
    const html = buildPopupHtml(marker)
    expect(html).toContain('Station a')
    expect(html).toContain('2,000 €/L')
    expect(html).toContain('1,2 km')
    expect(html).toContain('frais')
    expect(html).toContain('Itinéraire')
    expect(html).toContain('https://www.openstreetmap.org/directions')
    // Aucun service payant (NFR-SEC-3).
    expect(html).not.toMatch(/google|mapbox|tomtom|here\.com/i)
  })

  it('affiche l’enseigne et son logo dans la popup quand disponibles (021)', () => {
    const branded = station('t', { brand: 'TotalEnergies' })
    const marker2 = buildStationMapView([branded], null, null).markers[0]!
    const html = buildPopupHtml(marker2)
    expect(html).toContain('TotalEnergies')
    // Pas de logo fourni : repli initiale, jamais d'<img> cassé ni d'id.
    expect(html).not.toContain('<img')
    expect(html).toContain('>T</span>')
  })

  it('sans enseigne, la popup ne mentionne ni brand ni logo', () => {
    const marker2 = buildStationMapView([station('b', { brand: null })], null, null).markers[0]!
    const html = buildPopupHtml(marker2)
    expect(html).not.toContain('map-popup-brand')
  })

  it('échappe le HTML injecté par le nom de station (pas de XSS)', () => {
    const evil = buildStationMapView([station('x', { name: '<img src=x onerror=alert(1)>' })], null, null)
    const html = buildPopupHtml(evil.markers[0]!)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('escapeHtml', () => {
  it('échappe les caractères sensibles', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
})
