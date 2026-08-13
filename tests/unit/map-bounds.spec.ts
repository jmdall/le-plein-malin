// tests/unit/map-bounds.spec.ts — Emprises de la carte (ticket 039). Module pur :
// il décide quoi charger et, surtout, quoi NE PAS recharger. Sans cette
// couverture, chaque micro-pan déclencherait un appel API.
import { describe, expect, it } from 'vitest'
import { BOUNDS_EXPANSION, expandBounds, isBoundsCovered } from '../../app/utils/mapBounds'
import type { MapViewBounds } from '../../app/utils/mapBounds'

const paris: MapViewBounds = { swLat: 48.8, swLon: 2.2, neLat: 48.9, neLon: 2.4 }

describe('expandBounds (ticket 039)', () => {
  it('élargit symétriquement autour du centre', () => {
    const grown = expandBounds(paris, 2)
    const centerLat = (paris.swLat + paris.neLat) / 2
    const centerLon = (paris.swLon + paris.neLon) / 2
    expect((grown.swLat + grown.neLat) / 2).toBeCloseTo(centerLat, 10)
    expect((grown.swLon + grown.neLon) / 2).toBeCloseTo(centerLon, 10)
    // Facteur 2 → hauteur et largeur doublées.
    expect(grown.neLat - grown.swLat).toBeCloseTo((paris.neLat - paris.swLat) * 2, 10)
    expect(grown.neLon - grown.swLon).toBeCloseTo((paris.neLon - paris.swLon) * 2, 10)
  })

  it('contient toujours l’emprise d’origine', () => {
    const grown = expandBounds(paris, BOUNDS_EXPANSION)
    expect(isBoundsCovered(paris, [grown])).toBe(true)
  })

  it('un facteur ≤ 1 ne rétrécit jamais l’emprise', () => {
    expect(expandBounds(paris, 1)).toEqual(paris)
    expect(isBoundsCovered(paris, [expandBounds(paris, 0.5)])).toBe(true)
  })

  // L'emprise élargie part vers l'API, qui borne lat/lon à la France : elle ne
  // doit pas sortir des bornes terrestres et provoquer un 400.
  it('reste dans les bornes terrestres même en dézoom extrême', () => {
    const monde: MapViewBounds = { swLat: -85, swLon: -179, neLat: 85, neLon: 179 }
    const grown = expandBounds(monde, 4)
    expect(grown.swLat).toBeGreaterThanOrEqual(-90)
    expect(grown.neLat).toBeLessThanOrEqual(90)
    expect(grown.swLon).toBeGreaterThanOrEqual(-180)
    expect(grown.neLon).toBeLessThanOrEqual(180)
  })

  it('le facteur par défaut charge plus large que le viewport', () => {
    expect(BOUNDS_EXPANSION).toBeGreaterThan(1)
  })
})

describe('isBoundsCovered (ticket 039)', () => {
  it('faux quand rien n’a encore été chargé', () => {
    expect(isBoundsCovered(paris, [])).toBe(false)
  })

  it('vrai quand une emprise chargée contient strictement la demande', () => {
    const france: MapViewBounds = { swLat: 41, swLon: -5.5, neLat: 51.5, neLon: 9.8 }
    expect(isBoundsCovered(paris, [france])).toBe(true)
  })

  it('vrai pour une emprise identique (pan nul)', () => {
    expect(isBoundsCovered(paris, [paris])).toBe(true)
  })

  // Le cas qui compte : panner DANS une zone déjà chargée ne doit rien demander.
  it('vrai en pannant à l’intérieur d’une zone déjà chargée', () => {
    const large: MapViewBounds = { swLat: 48.5, swLon: 1.8, neLat: 49.2, neLon: 3.0 }
    const panne: MapViewBounds = { swLat: 48.85, swLon: 2.3, neLat: 48.95, neLon: 2.5 }
    expect(isBoundsCovered(panne, [large])).toBe(true)
  })

  it('faux dès qu’un seul côté dépasse', () => {
    const presque: MapViewBounds = { swLat: 48.8, swLon: 2.2, neLat: 48.9, neLon: 2.4 }
    expect(isBoundsCovered({ ...presque, neLat: 48.95 }, [paris])).toBe(false)
    expect(isBoundsCovered({ ...presque, swLat: 48.75 }, [paris])).toBe(false)
    expect(isBoundsCovered({ ...presque, neLon: 2.45 }, [paris])).toBe(false)
    expect(isBoundsCovered({ ...presque, swLon: 2.15 }, [paris])).toBe(false)
  })

  // Une emprise n'est PAS couverte par l'union de deux emprises adjacentes :
  // la couverture est testée emprise par emprise. C'est volontairement simple —
  // au pire on refait un appel, jamais on n'affiche une zone incomplète en
  // croyant l'avoir chargée.
  it('ne considère pas l’union de deux zones comme une couverture', () => {
    const gauche: MapViewBounds = { swLat: 48.8, swLon: 2.2, neLat: 48.9, neLon: 2.3 }
    const droite: MapViewBounds = { swLat: 48.8, swLon: 2.3, neLat: 48.9, neLon: 2.4 }
    expect(isBoundsCovered(paris, [gauche, droite])).toBe(false)
  })

  it('trouve la couverture quelle que soit sa position dans la liste', () => {
    const france: MapViewBounds = { swLat: 41, swLon: -5.5, neLat: 51.5, neLon: 9.8 }
    const petite: MapViewBounds = { swLat: 43, swLon: 5, neLat: 43.5, neLon: 5.5 }
    expect(isBoundsCovered(paris, [petite, france])).toBe(true)
    expect(isBoundsCovered(paris, [france, petite])).toBe(true)
  })
})
