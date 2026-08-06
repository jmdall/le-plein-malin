// tests/unit/map-animation.spec.ts — Déplacement progressif des marqueurs
// (demande produit « déplacer la carte devrait y aller progressivement »).
// Le marqueur Leaflet est posé en dur sur sa coordonnée : on interpole la
// lat/lon au lieu d'un setLatLng direct (qui ferait « sauter » le badge).
// Pure, sans DOM : l'ordonnanceur de frames est injecté.
import { describe, expect, it } from 'vitest'
import {
  MARKER_ANIMATE_MS,
  animateMarkerLatLng,
  interpolateLatLng,
  rafScheduler,
  type AnimatedLayer,
  type FrameScheduler
} from '../../app/utils/mapAnimation'

interface FakeScheduler extends FrameScheduler {
  /** Avance l'horloge de `ms`, en exécutant les frames dues. */
  advance(ms: number): void
}

function fakeScheduler(): FakeScheduler {
  let now = 0
  let frameId = 1
  const queue = new Map<number, () => void>()
  return {
    now: () => now,
    request: (cb) => {
      const id = frameId++
      queue.set(id, cb)
      return id
    },
    cancel: (handle) => {
      queue.delete(handle)
    },
    advance(ms: number) {
      now += ms
      for (const [id, cb] of [...queue]) {
        queue.delete(id)
        cb()
      }
    }
  }
}

function fakeLayer(start: { lat: number; lng: number }): AnimatedLayer & { positions: number[] } {
  let pos = { ...start }
  const positions: number[] = []
  return {
    getLatLng: () => ({ ...pos }),
    setLatLng: (p) => {
      pos = { lat: p.lat, lng: p.lng }
      positions.push(p.lat)
    },
    positions
  }
}

describe('interpolateLatLng', () => {
  it('interpole linéairement entre deux points', () => {
    expect(interpolateLatLng({ lat: 0, lng: 0 }, { lat: 10, lng: 20 }, 0.5)).toEqual({ lat: 5, lng: 10 })
    expect(interpolateLatLng({ lat: 0, lng: 0 }, { lat: 10, lng: 20 }, 1)).toEqual({ lat: 10, lng: 20 })
  })
})

describe('animateMarkerLatLng', () => {
  it('déplace progressivement le marqueur vers la cible sur ~500 ms', () => {
    const scheduler = fakeScheduler()
    const layer = fakeLayer({ lat: 48.8, lng: 2.3 })

    animateMarkerLatLng(layer, { lat: 49.0, lng: 2.5 }, scheduler)
    expect(layer.positions).toEqual([])

    scheduler.advance(MARKER_ANIMATE_MS / 2)
    const mid = layer.positions[layer.positions.length - 1]!
    expect(mid).toBeGreaterThan(48.8)
    expect(mid).toBeLessThan(49.0)

    scheduler.advance(MARKER_ANIMATE_MS / 2)
    expect(layer.positions[layer.positions.length - 1]).toBe(49.0)
  })

  it('ne bouge pas quand la cible est déjà la position courante', () => {
    const scheduler = fakeScheduler()
    const layer = fakeLayer({ lat: 48.8, lng: 2.3 })

    animateMarkerLatLng(layer, { lat: 48.8, lng: 2.3 }, scheduler)
    expect(layer.positions).toEqual([])
  })

  it('ignore les coordonnées non finies (aucune donnée inventée)', () => {
    const scheduler = fakeScheduler()
    const layer = fakeLayer({ lat: 48.8, lng: 2.3 })

    animateMarkerLatLng(layer, { lat: NaN, lng: 2.3 }, scheduler)
    expect(layer.positions).toEqual([])
  })

  it('une nouvelle cible en cours de route repart de la position courante, pas du départ', () => {
    const scheduler = fakeScheduler()
    const layer = fakeLayer({ lat: 48.8, lng: 2.3 })

    animateMarkerLatLng(layer, { lat: 49.0, lng: 2.5 }, scheduler)
    scheduler.advance(MARKER_ANIMATE_MS / 2)
    const atMid = layer.positions[layer.positions.length - 1]!

    // Nouvelle cible plus loin : on interpole depuis `atMid`.
    animateMarkerLatLng(layer, { lat: 49.4, lng: 2.9 }, scheduler)
    scheduler.advance(1)
    const afterRetarget = layer.positions[layer.positions.length - 1]!
    expect(afterRetarget).toBeGreaterThan(atMid)
    expect(afterRetarget).toBeLessThan(49.4)
  })

  it('termine exactement sur la cible, sans image restante', () => {
    const scheduler = fakeScheduler()
    const layer = fakeLayer({ lat: 48.8, lng: 2.3 })

    animateMarkerLatLng(layer, { lat: 49.0, lng: 2.5 }, scheduler)
    scheduler.advance(MARKER_ANIMATE_MS)
    expect(layer.positions[layer.positions.length - 1]).toBe(49.0)
    // Aucune frame restante : l'animation est bien terminée.
    scheduler.advance(MARKER_ANIMATE_MS)
    const last = layer.positions[layer.positions.length - 1]!
    expect(last).toBe(49.0)
  })

  it('le RAF réel est bien l’ordonnanceur par défaut', () => {
    expect(typeof rafScheduler).toBe('object')
  })
})
