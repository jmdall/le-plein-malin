// tests/unit/geolocation.spec.ts — Géolocalisation côté web (ticket 024) :
// sur le web / dev, l'app utilise l'API navigateur standard
// (`navigator.geolocation`). Le chemin natif Capacitor (APK) est couvert par
// geolocation-native.spec.ts. Les deux doivent retourner un GeoResult typé,
// jamais de rejet non géré.
import { describe, expect, it, vi, beforeEach } from 'vitest'

type GeoResult = {
  ok: boolean
  position?: { lat: number; lon: number }
  error?: string
  denied?: boolean
}

async function freshLocation() {
  vi.resetModules()
  const mod = await import('../../app/utils/location')
  return mod as {
    requestGeolocation: () => Promise<GeoResult>
  }
}

function stubWindowWithGeolocation(getCurrentPosition: (success: (p: unknown) => void, error: (e: unknown) => void) => void) {
  const window = {
    navigator: { geolocation: { getCurrentPosition } }
  }
  vi.stubGlobal('window', window)
  return window
}

describe('géolocalisation — API navigateur (web / dev)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('retourne la position quand l’API navigateur réussit', async () => {
    stubWindowWithGeolocation((success) => {
      success({ coords: { latitude: 48.8566, longitude: 2.3522 } })
    })
    const location = await freshLocation()
    const result = await location.requestGeolocation()
    expect(result.ok).toBe(true)
    expect(result.position).toEqual({ lat: 48.8566, lon: 2.3522 })
  })

  it('marque denied quand l’utilisateur refuse (PERMISSION_DENIED)', async () => {
    const err: Record<number, number> = { 1: 1 }
    const deniedError = Object.assign({ code: 1 }, err) as unknown as { code: number; PERMISSION_DENIED: number }
    deniedError.PERMISSION_DENIED = 1
    stubWindowWithGeolocation((_, error) => {
      error(deniedError)
    })
    const location = await freshLocation()
    const result = await location.requestGeolocation()
    expect(result.ok).toBe(false)
    expect(result.denied).toBe(true)
    expect(result.error).toContain('refusé')
  })

  it('gère l’absence de géolocalisation navigateur (hors Capacitor)', async () => {
    vi.stubGlobal('window', { navigator: {} })
    const location = await freshLocation()
    const result = await location.requestGeolocation()
    expect(result.ok).toBe(false)
    expect(result.denied).toBeUndefined()
    expect(result.error).toContain('pas disponible')
  })
})
