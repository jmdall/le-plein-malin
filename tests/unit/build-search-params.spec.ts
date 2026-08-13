// tests/unit/build-search-params.spec.ts — Construction des paramètres de
// recherche communs aux composables useStations et useFuelRecommendation
// (ticket 029). Fonction pure : priorité lat/lon → postalCode → city → q,
// puis radius et fuel (via fuelToApi). Aucune règle métier dupliquée : le
// serveur valide encore la requête (baseLocationSchema).
import { describe, expect, it } from 'vitest'
import { buildSearchParams } from '../../app/utils/stations'

function params(request: {
  lat?: number
  lon?: number
  q?: string
  city?: string
  postalCode?: string
  positionSource?: 'device' | 'place'
  radius: number
  fuel: 'SP95' | 'SP95-E10' | 'SP98' | 'E85' | 'Gazole' | 'GPLc'
}): Record<string, string> {
  return Object.fromEntries(buildSearchParams(request).entries())
}

describe('buildSearchParams (ticket 029)', () => {
  it('lat+lon présents → params lat, lon, radius, fuel ; ni q ni city ni postalCode', () => {
    const p = params({ lat: 48.86, lon: 2.34, radius: 20, fuel: 'Gazole' })
    expect(p).toEqual({ lat: '48.86', lon: '2.34', radius: '20', fuel: 'Gazole' })
  })

  it('lat sans lon → ignore la paire et utilise le suivant (postalCode)', () => {
    const p = params({ lat: 48.86, postalCode: '69001', radius: 10, fuel: 'Gazole' })
    expect(p.postalCode).toBe('69001')
    expect(p.lat).toBeUndefined()
    expect(p.lon).toBeUndefined()
  })

  it('lon sans lat → ignore la paire et utilise le suivant (city)', () => {
    const p = params({ lon: 2.34, city: 'Lyon', radius: 10, fuel: 'Gazole' })
    expect(p.city).toBe('Lyon')
    expect(p.lat).toBeUndefined()
    expect(p.lon).toBeUndefined()
  })

  it('postalCode → param postalCode (priorité sur city et q)', () => {
    const p = params({ postalCode: '69001', city: 'Lyon', q: 'lyon', radius: 10, fuel: 'Gazole' })
    expect(p).toEqual({ postalCode: '69001', radius: '10', fuel: 'Gazole' })
  })

  it('city → param city (priorité sur q)', () => {
    const p = params({ city: 'Lyon', q: 'lyon', radius: 10, fuel: 'Gazole' })
    expect(p.city).toBe('Lyon')
    expect(p.q).toBeUndefined()
  })

  it('q → param q en dernier recours', () => {
    const p = params({ q: 'Paris 8', radius: 10, fuel: 'Gazole' })
    expect(p).toEqual({ q: 'Paris 8', radius: '10', fuel: 'Gazole' })
  })

  // ——— Ticket 031 : provenance des coordonnées ———
  // Un lieu choisi dans l'autocomplete donne un centre exact, mais ce n'est pas
  // la position de l'appareil : le serveur doit pouvoir garder l'hypothèse de
  // détour. Le défaut (device) laisse la géolocalisation et le déplacement de
  // carte inchangés, donc le paramètre n'est émis que pour « place ».
  it('positionSource=place → param transmis avec lat/lon (ticket 031)', () => {
    const p = params({
      lat: 47.2184,
      lon: -1.5536,
      positionSource: 'place',
      radius: 10,
      fuel: 'Gazole'
    })
    expect(p).toEqual({
      lat: '47.2184',
      lon: '-1.5536',
      positionSource: 'place',
      radius: '10',
      fuel: 'Gazole'
    })
  })

  it('positionSource=device (ou absent) → aucun param : le défaut serveur suffit', () => {
    expect(
      params({ lat: 48.86, lon: 2.34, positionSource: 'device', radius: 10, fuel: 'Gazole' })
        .positionSource
    ).toBeUndefined()
    expect(params({ lat: 48.86, lon: 2.34, radius: 10, fuel: 'Gazole' }).positionSource)
      .toBeUndefined()
  })

  it('positionSource sans lat/lon → jamais transmis (le centre vient du texte)', () => {
    expect(
      params({ q: 'Nantes', positionSource: 'place', radius: 10, fuel: 'Gazole' }).positionSource
    ).toBeUndefined()
  })

  it('fuel converti via fuelToApi (Gazole → Gazole, SP95-E10 → E10)', () => {
    expect(params({ lat: 48.86, lon: 2.34, radius: 10, fuel: 'Gazole' }).fuel).toBe('Gazole')
    expect(params({ lat: 48.86, lon: 2.34, radius: 10, fuel: 'SP95-E10' }).fuel).toBe('E10')
  })

  it('radius toujours présent, quel que soit le mode de localisation', () => {
    expect(params({ city: 'Paris', radius: 30, fuel: 'SP95' }).radius).toBe('30')
  })
})
