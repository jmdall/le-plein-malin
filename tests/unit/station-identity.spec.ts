// tests/unit/station-identity.spec.ts — Présentation de l'identité d'une
// station (ticket 021) : validation des URL de logo, repli initiale/⛽,
// jamais d'image cassée ni de vecteur d'information unique (NFR-ACC-4).
import { describe, expect, it } from 'vitest'
import {
  brandInitial,
  identityBadgeFor,
  isSafeLogoUrl,
  OSM_ATTRIBUTION_NOTE
} from '../../utils/stationIdentity'

describe('isSafeLogoUrl (ticket 021)', () => {
  it('accepte uniquement https sur upload.wikimedia.org', () => {
    expect(isSafeLogoUrl('https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg')).toBe(true)
    expect(isSafeLogoUrl('http://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg')).toBe(false)
    expect(isSafeLogoUrl('https://evil.example.com/x.png')).toBe(false)
    expect(isSafeLogoUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isSafeLogoUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeLogoUrl('')).toBe(false)
    expect(isSafeLogoUrl(null)).toBe(false)
    expect(isSafeLogoUrl(undefined)).toBe(false)
  })
})

describe('brandInitial', () => {
  it('prend la première lettre significative, en majuscule', () => {
    expect(brandInitial('TotalEnergies')).toBe('T')
    expect(brandInitial('E.Leclerc')).toBe('E')
    expect(brandInitial('  intermarche ')).toBe('I')
    expect(brandInitial('   ')).toBe('')
  })
})

describe('identityBadgeFor', () => {
  it('label = enseigne quand présente, sinon nom réel — jamais l’id', () => {
    const withBrand = identityBadgeFor({ brand: 'Total', logoUrl: null, name: '75001003' })
    expect(withBrand.label).toBe('Total')
    expect(withBrand.fallbackGlyph).toBe('T')

    const withoutBrand = identityBadgeFor({ brand: null, logoUrl: null, name: 'Carrefour Market' })
    expect(withoutBrand.label).toBe('Carrefour Market')
    expect(withoutBrand.fallbackGlyph).toBe('⛽')

    const empty = identityBadgeFor({ brand: null, logoUrl: null, name: '' })
    expect(empty.label).toBe('Station')
  })

  it('garde le logo seulement si l’URL est sûre', () => {
    const ok = 'https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg'
    expect(identityBadgeFor({ brand: 'Total', logoUrl: ok, name: 'x' }).logoUrl).toBe(ok)
    expect(identityBadgeFor({ brand: 'Total', logoUrl: 'https://evil.example.com/x.png', name: 'x' }).logoUrl).toBeNull()
  })
})

describe('OSM_ATTRIBUTION_NOTE', () => {
  it('mentionne la source OpenStreetMap et la licence ODbL', () => {
    expect(OSM_ATTRIBUTION_NOTE).toContain('OpenStreetMap')
    expect(OSM_ATTRIBUTION_NOTE).toContain('ODbL')
  })
})
