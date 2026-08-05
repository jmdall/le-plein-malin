// tests/unit/geolocation-native.spec.ts — Géolocalisation sur l'APK (ticket
// 024) : en WebView Capacitor, `navigator.geolocation` renvoie toujours
// PERMISSION_DENIED sans prompt système. Le code passe donc par le bridge
// natif `@capacitor/core` (registerPlugin('Geolocation')). Ce fichier mocke
// statiquement `@capacitor/core` (la version réelle est inutilisable hors
// WebView) et vérifie que le bridge est bien pris en priorité.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { requestGeolocation } from '../../app/utils/location'

const { requestPermissions, getCurrentPosition, registerPlugin } = vi.hoisted(() => {
  const requestPermissions = vi.fn()
  const getCurrentPosition = vi.fn()
  const registerPlugin = vi.fn(() => ({ requestPermissions, getCurrentPosition }))
  return { requestPermissions, getCurrentPosition, registerPlugin }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin
}))

describe('géolocalisation — bridge natif Capacitor (APK Android)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('utilise le bridge natif et retourne la position', async () => {
    requestPermissions.mockResolvedValue({ location: 'granted' })
    getCurrentPosition.mockResolvedValue({ coords: { latitude: 45.764, longitude: 4.8357 } })
    const result = await requestGeolocation()
    expect(result.ok).toBe(true)
    expect(result.position).toEqual({ lat: 45.764, lon: 4.8357 })
    expect(registerPlugin).toHaveBeenCalledWith('Geolocation')
    expect(requestPermissions).toHaveBeenCalled()
    expect(getCurrentPosition).toHaveBeenCalled()
  })

  it('marque denied quand la permission native est refusée', async () => {
    requestPermissions.mockResolvedValue({ location: 'denied' })
    const result = await requestGeolocation()
    expect(result.ok).toBe(false)
    expect(result.denied).toBe(true)
    expect(result.error).toContain('refusé')
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('accepte la permission coarseLocation comme suffisante', async () => {
    requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'granted' })
    getCurrentPosition.mockResolvedValue({ coords: { latitude: 43.6047, longitude: 1.4442 } })
    const result = await requestGeolocation()
    expect(result.ok).toBe(true)
    expect(result.position).toEqual({ lat: 43.6047, lon: 1.4442 })
  })

  it('ne rejette jamais si le bridge natif échoue', async () => {
    requestPermissions.mockRejectedValue(new Error('native exploded'))
    const result = await requestGeolocation()
    expect(result.ok).toBe(false)
    expect(result.denied).toBeUndefined()
    expect(result.error).toBeTruthy()
  })
})
