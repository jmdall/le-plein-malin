// tests/unit/api-fetch.spec.ts — apiFetch : transport HTTP unique du client
// (ticket 029). Encapsule fetch + erreur normalisée (messages français) +
// parsing JSON + garde anti-race isStale. Les messages d'erreur sont EXACTS :
// ils sont vérifiés via les composables par les tests existants.
import { describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../app/utils/api'

function installFetchMock(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('apiFetch (ticket 029)', () => {
  it('succès : response.ok + JSON valide → { ok: true, data }', async () => {
    installFetchMock(async () => jsonResponse({ stations: [] }))
    const params = new URLSearchParams({ lat: '48.86', lon: '2.34' })
    const result = await apiFetch<{ stations: unknown[] }>('/api/stations', params)
    expect(result).toEqual({ ok: true, data: { stations: [] } })
  })

  it('construit l’URL avec apiUrl (base + path + querystring)', async () => {
    let capturedUrl = ''
    installFetchMock(async (url) => {
      capturedUrl = url
      return jsonResponse({ ok: 1 })
    })
    const params = new URLSearchParams({ radius: '10', fuel: 'Gazole' })
    await apiFetch<{ ok: number }>('/api/stations', params)
    const url = new URL(capturedUrl, 'http://localhost')
    expect(url.pathname).toBe('/api/stations')
    expect(url.searchParams.get('radius')).toBe('10')
    expect(url.searchParams.get('fuel')).toBe('Gazole')
  })

  it('réseau KO (fetch rejette) → { ok: false, error: "Impossible de joindre…" }', async () => {
    installFetchMock(async () => {
      throw new TypeError('fetch failed')
    })
    const result = await apiFetch('/api/stations', new URLSearchParams())
    expect(result).toEqual({
      ok: false,
      error: 'Impossible de joindre le serveur. Vérifiez votre connexion.'
    })
  })

  it('non-ok avec { error: { message } } → { ok: false, error: message }', async () => {
    installFetchMock(async () =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne' } }, 500)
    )
    const result = await apiFetch('/api/stations', new URLSearchParams())
    expect(result).toEqual({ ok: false, error: 'Erreur interne' })
  })

  it('non-ok sans corps JSON → { ok: false, error: "Le serveur a renvoyé une erreur." }', async () => {
    installFetchMock(async () => new Response('boom', { status: 500 }))
    const result = await apiFetch('/api/stations', new URLSearchParams())
    expect(result).toEqual({ ok: false, error: 'Le serveur a renvoyé une erreur.' })
  })

  it('ok mais JSON invalide → { ok: false, error: "Le serveur a renvoyé une réponse invalide." }', async () => {
    installFetchMock(async () => new Response('pas-du-json', { status: 200 }))
    const result = await apiFetch('/api/stations', new URLSearchParams())
    expect(result).toEqual({
      ok: false,
      error: 'Le serveur a renvoyé une réponse invalide.'
    })
  })

  it('isStale devient vrai pendant l’await → { ok: false, error: "stale" } (succès ignoré)', async () => {
    let resolveResponse: (r: Response) => void = () => {}
    let stale = false
    installFetchMock(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve
        })
    )
    const pending = apiFetch<{ ok: number }>('/api/stations', new URLSearchParams(), {
      isStale: () => stale
    })
    resolveResponse(jsonResponse({ ok: 1 }))
    stale = true
    const result = await pending
    expect(result).toEqual({ ok: false, error: 'stale' })
  })

  it('isStale vrai au retour mais faux pendant l’await → succès normal', async () => {
    installFetchMock(async () => jsonResponse({ ok: 1 }))
    let stale = false
    const result = await apiFetch<{ ok: number }>('/api/stations', new URLSearchParams(), {
      isStale: () => stale
    })
    stale = true
    expect(result).toEqual({ ok: true, data: { ok: 1 } })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
