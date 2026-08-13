// tests/unit/compression.spec.ts — Compression des réponses API (ticket 038).
// Vérifié sur le serveur bâti : Nitro ne compresse pas les réponses dynamiques,
// donc /api/map/stations envoyait 879 Ko en clair pour la France entière.
//
// La DÉCISION est pure et testée ici ; le plugin Nitro n'est qu'une glue I/O.
// Invariant central : la compression est un TRANSPORT — le corps décompressé
// doit être identique à l'original, octet pour octet.
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  MIN_COMPRESS_BYTES,
  acceptsGzip,
  gzipBuffer,
  shouldCompress
} from '../../server/lib/compression'

const big = MIN_COMPRESS_BYTES + 1

function decision(overrides: Partial<Parameters<typeof shouldCompress>[0]> = {}) {
  return shouldCompress({
    method: 'GET',
    path: '/api/map/stations',
    acceptEncoding: 'gzip, deflate, br',
    existingEncoding: undefined,
    byteLength: big,
    ...overrides
  })
}

describe('acceptsGzip (ticket 038)', () => {
  it('accepte les en-têtes courants des navigateurs', () => {
    expect(acceptsGzip('gzip, deflate, br')).toBe(true)
    expect(acceptsGzip('gzip')).toBe(true)
    expect(acceptsGzip('br, gzip')).toBe(true)
    expect(acceptsGzip('GZIP')).toBe(true)
    expect(acceptsGzip('gzip;q=1.0, identity;q=0.5')).toBe(true)
  })

  it('refuse quand gzip est absent', () => {
    expect(acceptsGzip(undefined)).toBe(false)
    expect(acceptsGzip('')).toBe(false)
    expect(acceptsGzip('identity')).toBe(false)
    expect(acceptsGzip('br')).toBe(false)
    expect(acceptsGzip('deflate')).toBe(false)
  })

  // `gzip;q=0` est un REFUS explicite (RFC 9110). Chercher naïvement la
  // sous-chaîne « gzip » enverrait une réponse que le client rejette.
  it('traite gzip;q=0 comme un refus', () => {
    expect(acceptsGzip('gzip;q=0')).toBe(false)
    expect(acceptsGzip('gzip;q=0.0')).toBe(false)
    expect(acceptsGzip('gzip; q=0')).toBe(false)
    expect(acceptsGzip('deflate, gzip;q=0, identity')).toBe(false)
  })

  // Ne pas confondre un autre encodage dont le nom contient « gzip ».
  it('ne confond pas x-gzip-like avec gzip', () => {
    expect(acceptsGzip('notgzip')).toBe(false)
  })
})

describe('shouldCompress (ticket 038)', () => {
  it('compresse une réponse API JSON assez grosse demandée en gzip', () => {
    expect(decision()).toBe(true)
  })

  it('ne compresse rien hors de /api/', () => {
    expect(decision({ path: '/' })).toBe(false)
    expect(decision({ path: '/favoris' })).toBe(false)
    // Le HTML SSR passe par d'autres chemins de rendu : hors périmètre assumé.
    expect(decision({ path: '/_nuxt/entry.js' })).toBe(false)
  })

  it('ne compresse pas sous le seuil (~1 MTU) : aucun gain, du CPU perdu', () => {
    expect(decision({ byteLength: MIN_COMPRESS_BYTES - 1 })).toBe(false)
    expect(decision({ byteLength: 0 })).toBe(false)
    // /api/health est petit : il doit rester en clair.
    expect(decision({ path: '/api/health', byteLength: 60 })).toBe(false)
  })

  it('compresse exactement au seuil', () => {
    expect(decision({ byteLength: MIN_COMPRESS_BYTES })).toBe(true)
  })

  it('ne compresse pas si le client ne l’accepte pas', () => {
    expect(decision({ acceptEncoding: undefined })).toBe(false)
    expect(decision({ acceptEncoding: 'identity' })).toBe(false)
    expect(decision({ acceptEncoding: 'gzip;q=0' })).toBe(false)
  })

  // Double encodage : le corps serait illisible.
  it('ne touche pas un corps déjà encodé', () => {
    expect(decision({ existingEncoding: 'gzip' })).toBe(false)
    expect(decision({ existingEncoding: 'br' })).toBe(false)
  })

  it('ne compresse pas une réponse HEAD (aucun corps)', () => {
    expect(decision({ method: 'HEAD' })).toBe(false)
  })

  it('compresse les autres méthodes qui renvoient du JSON (PUT profil)', () => {
    expect(decision({ method: 'PUT', path: '/api/vehicle-profile' })).toBe(true)
    expect(decision({ method: 'POST', path: '/api/sync' })).toBe(true)
  })
})

describe('gzipBuffer (ticket 038)', () => {
  // L'invariant qui compte : la compression est un transport, pas une
  // transformation. Rien ne doit changer dans les données.
  it('aller-retour sans perte sur un JSON réaliste de carte', async () => {
    const stations = Array.from({ length: 2_000 }, (_v, i) => ({
      id: `100000${i}`,
      lat: 48.85 + i / 10_000,
      lon: 2.35 + i / 10_000,
      price: 1.799 + (i % 40) / 1000,
      ageInHours: i % 72,
      status: i % 3 === 0 ? 'fresh' : i % 3 === 1 ? 'stale' : 'obsolete'
    }))
    const original = JSON.stringify({ stations, truncated: false })

    const compressed = await gzipBuffer(original)
    expect(compressed.byteLength).toBeLessThan(Buffer.byteLength(original))
    expect(JSON.parse(gunzipSync(compressed).toString('utf8'))).toEqual(
      JSON.parse(original)
    )
  })

  it('préserve exactement les caractères non-ASCII (accents, €)', async () => {
    const original = JSON.stringify({
      message: 'Détour estimé sur le réseau routier — économie nette 5,62 €',
      repeat: 'éàçûô'.repeat(500)
    })
    const compressed = await gzipBuffer(original)
    expect(gunzipSync(compressed).toString('utf8')).toBe(original)
  })

  it('compresse fortement un JSON répétitif (l’ordre de grandeur attendu)', async () => {
    const rows = Array.from({ length: 5_000 }, (_v, i) => ({
      id: String(i),
      lat: 48.1,
      lon: 2.2,
      price: 1.8,
      ageInHours: 3,
      status: 'fresh'
    }))
    const original = JSON.stringify(rows)
    const compressed = await gzipBuffer(original)
    // Mesuré sur la vraie réponse France : 879 Ko → 127 Ko, soit ~7×.
    expect(Buffer.byteLength(original) / compressed.byteLength).toBeGreaterThan(5)
  })
})
