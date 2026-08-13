// tests/unit/resolve-search-input.spec.ts — Décision de recherche ville / CP /
// adresse (ticket 031). Fonction PURE extraite de pages/index.vue : elle
// décide ce qui part vers l'API (lat/lon, postalCode ou q) et ce qui est
// mémorisé localement. C'est ici que se joue la correction du double
// géocodage : une suggestion choisie fournit son centre, et ce centre gagne.
import { describe, expect, it } from 'vitest'
import { resolveSearchInput } from '../../app/utils/location'

describe('resolveSearchInput (ticket 031)', () => {
  it('avec une position (suggestion choisie) : lat/lon partent seuls', () => {
    const resolved = resolveSearchInput('Paris 75001', { lat: 48.8566, lon: 2.3522 })
    expect(resolved).not.toBeNull()
    // positionSource : le centre est exact, mais ce n'est pas la position de
    // l'appareil — le serveur doit garder l'hypothèse de détour (ticket 031).
    expect(resolved!.target).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      positionSource: 'place'
    })
    // Le texte ne doit PAS accompagner les coordonnées : c'est exactement ce
    // qui provoquait un second géocodage serveur.
    expect(resolved!.target.q).toBeUndefined()
    expect(resolved!.target.postalCode).toBeUndefined()
  })

  it('la position gagne même quand le texte est un code postal', () => {
    const resolved = resolveSearchInput('44000', { lat: 47.2184, lon: -1.5536 })
    expect(resolved!.target).toEqual({
      lat: 47.2184,
      lon: -1.5536,
      positionSource: 'place'
    })
  })

  it('sans position, aucun positionSource : le centre vient du géocodage serveur', () => {
    expect(resolveSearchInput('Nantes', null)!.target.positionSource).toBeUndefined()
    expect(resolveSearchInput('44000', null)!.target.positionSource).toBeUndefined()
  })

  it('sans position, 5 chiffres → postalCode (géocodage serveur)', () => {
    const resolved = resolveSearchInput('44000', null)
    expect(resolved!.target).toEqual({ postalCode: '44000' })
    expect(resolved!.saved).toEqual({ source: 'postalCode', q: '44000' })
  })

  it('sans position, texte libre → q', () => {
    const resolved = resolveSearchInput('Nantes', null)
    expect(resolved!.target).toEqual({ q: 'Nantes' })
    expect(resolved!.saved).toEqual({ source: 'city', q: 'Nantes' })
  })

  it('le texte est nettoyé avant décision, et sert de libellé', () => {
    const resolved = resolveSearchInput('  44000  ', null)
    expect(resolved!.label).toBe('44000')
    expect(resolved!.target).toEqual({ postalCode: '44000' })
  })

  it('une entrée vide ne lance aucune recherche', () => {
    expect(resolveSearchInput('', null)).toBeNull()
    expect(resolveSearchInput('   ', null)).toBeNull()
    expect(resolveSearchInput('   ', { lat: 48.8566, lon: 2.3522 })).toBeNull()
  })

  // LOC-4 / NFR-SEC-4 : aucune coordonnée n'est jamais mémorisée localement.
  // Le rejeu au montage repasse donc par le texte et le géocodage serveur.
  it('ce qui est mémorisé ne contient jamais de coordonnées', () => {
    const resolved = resolveSearchInput('Paris 75001', { lat: 48.8566, lon: 2.3522 })
    expect(Object.keys(resolved!.saved).sort()).toEqual(['q', 'source'])
    expect(resolved!.saved).toEqual({ source: 'city', q: 'Paris 75001' })
  })

  it('un code postal choisi dans la liste reste mémorisé comme un code postal', () => {
    const resolved = resolveSearchInput('44000', { lat: 47.2184, lon: -1.5536 })
    expect(resolved!.saved).toEqual({ source: 'postalCode', q: '44000' })
  })

  it('une position non finie est ignorée : repli sur le texte', () => {
    const resolved = resolveSearchInput('Nantes', { lat: Number.NaN, lon: -1.5536 })
    expect(resolved!.target).toEqual({ q: 'Nantes' })
  })

  // ——— Bornes acceptées par l'API (revue de code, ticket 031) ———
  // `baseLocationSchema` (server/lib/validation.ts) borne lat/lon à la France
  // métropolitaine et répond 400 en dehors. Une suggestion du BAN en outre-mer
  // est une coordonnée parfaitement valide : si on l'envoyait telle quelle, une
  // recherche qui fonctionnait (par texte, géocodée côté serveur) renverrait
  // désormais une erreur. Hors bornes ⇒ on retombe sur le texte.
  it('une position hors des bornes acceptées par l’API : repli sur le texte', () => {
    // La Réunion (lat ≈ -21) et la Guadeloupe (lon ≈ -61) : hors bornes API.
    const reunion = resolveSearchInput('Saint-Denis 97400', { lat: -20.879, lon: 55.448 })
    expect(reunion!.target).toEqual({ q: 'Saint-Denis 97400' })

    const guadeloupe = resolveSearchInput('97110', { lat: 16.241, lon: -61.534 })
    expect(guadeloupe!.target).toEqual({ postalCode: '97110' })
  })

  it('une position en France métropolitaine est conservée (bornes incluses)', () => {
    // Bornes exactes du schéma serveur : elles doivent passer.
    expect(resolveSearchInput('Extrême sud', { lat: 41, lon: -5.5 })!.target).toEqual({
      lat: 41,
      lon: -5.5,
      positionSource: 'place'
    })
    expect(resolveSearchInput('Extrême nord-est', { lat: 51.5, lon: 9.8 })!.target).toEqual({
      lat: 51.5,
      lon: 9.8,
      positionSource: 'place'
    })
  })
})
