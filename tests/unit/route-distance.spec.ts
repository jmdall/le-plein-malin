// tests/unit/route-distance.spec.ts — Provider de distances routières OSRM
// (ticket 033, ADR-0005). Un seul appel /table par recherche, cache SQLite,
// repli par destination. Le fetch est injecté : aucun appel réseau réel ici.
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import {
  OSRM_BASE_URL,
  OSRM_MAX_DESTINATIONS,
  buildOsrmTableUrl,
  createOsrmRouteProvider,
  parseOsrmTable,
  routeCacheKey
} from '../../server/providers/routeDistance'
import type { Db } from '../../server/db/client'

function createTestDb(): { db: Db; close: () => void } {
  const sqlite = new Database(':memory:')
  return { db: drizzle(sqlite) as unknown as Db, close: () => sqlite.close() }
}

const CENTER = { lat: 48.8566, lon: 2.3522 }
const A = { lat: 48.87, lon: 2.36 }
const B = { lat: 48.85, lon: 2.34 }

// Réponse OSRM /table : distances en MÈTRES, première ligne = depuis source 0.
function osrmOk(metres: Array<number | null>) {
  return { code: 'Ok', distances: [[0, ...metres]] }
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response
}

describe('buildOsrmTableUrl (ticket 033)', () => {
  it('ordonne les coordonnées en lon,lat et met la source en premier', () => {
    const url = new URL(buildOsrmTableUrl(CENTER, [A, B]))
    expect(url.origin + url.pathname).toBe(
      `${OSRM_BASE_URL}/table/v1/driving/2.3522,48.8566;2.36,48.87;2.34,48.85`
    )
    expect(url.searchParams.get('sources')).toBe('0')
    // annotations=distance : sans ça OSRM renvoie des DURÉES, pas des distances.
    expect(url.searchParams.get('annotations')).toBe('distance')
  })

  it('accepte une base personnalisée (instance auto-hébergée, ADR-0005)', () => {
    const url = buildOsrmTableUrl(CENTER, [A], 'https://osrm.example.test')
    expect(url.startsWith('https://osrm.example.test/table/v1/driving/')).toBe(true)
  })
})

describe('parseOsrmTable (ticket 033)', () => {
  it('convertit les mètres en km, dans l’ordre des destinations', () => {
    const parsed = parseOsrmTable(osrmOk([4200, 1500]), 2)
    expect(parsed).toEqual([4.2, 1.5])
  })

  it('null par destination sans route — jamais une distance inventée', () => {
    expect(parseOsrmTable(osrmOk([4200, null]), 2)).toEqual([4.2, null])
  })

  it('complète en null si OSRM renvoie moins de distances que demandé', () => {
    expect(parseOsrmTable(osrmOk([4200]), 3)).toEqual([4.2, null, null])
  })

  it('lève quand la réponse n’est pas exploitable (code != Ok, forme invalide)', () => {
    expect(() => parseOsrmTable({ code: 'NoRoute' }, 1)).toThrow()
    expect(() => parseOsrmTable({ code: 'Ok' }, 1)).toThrow()
    expect(() => parseOsrmTable({ code: 'Ok', distances: [] }, 1)).toThrow()
    expect(() => parseOsrmTable(null, 1)).toThrow()
  })

  it('ignore une distance non numérique plutôt que de la propager', () => {
    expect(parseOsrmTable({ code: 'Ok', distances: [[0, '4200']] }, 1)).toEqual([null])
  })
})

describe('routeCacheKey (ticket 033)', () => {
  it('arrondit à 3 décimales (~110 m) : deux centres voisins partagent la clé', () => {
    const k1 = routeCacheKey({ lat: 48.85661, lon: 2.35221 }, A)
    const k2 = routeCacheKey({ lat: 48.85664, lon: 2.35224 }, A)
    expect(k1).toBe(k2)
  })

  it('distingue origine et destination (la clé n’est pas symétrique)', () => {
    expect(routeCacheKey(CENTER, A)).not.toBe(routeCacheKey(A, CENTER))
  })
})

describe('createOsrmRouteProvider (ticket 033)', () => {
  it('un seul appel HTTP pour toutes les destinations (service /table)', async () => {
    const h = createTestDb()
    try {
      let calls = 0
      const provider = createOsrmRouteProvider(h.db, {
        fetchFn: async () => {
          calls++
          return jsonResponse(osrmOk([4200, 1500]))
        }
      })
      const distances = await provider.tableFromOrigin(CENTER, [A, B])
      expect(distances).toEqual([4.2, 1.5])
      expect(calls).toBe(1)
    } finally {
      h.close()
    }
  })

  it('deuxième recherche au même endroit : zéro appel (cache SQLite)', async () => {
    const h = createTestDb()
    try {
      let calls = 0
      const fetchFn = async () => {
        calls++
        return jsonResponse(osrmOk([4200, 1500]))
      }
      const provider = createOsrmRouteProvider(h.db, { fetchFn })
      await provider.tableFromOrigin(CENTER, [A, B])
      expect(calls).toBe(1)

      const again = await provider.tableFromOrigin(CENTER, [A, B])
      expect(again).toEqual([4.2, 1.5])
      expect(calls).toBe(1)
    } finally {
      h.close()
    }
  })

  it('ne demande QUE les destinations manquantes du cache', async () => {
    const h = createTestDb()
    try {
      const requested: number[] = []
      const provider = createOsrmRouteProvider(h.db, {
        fetchFn: async (url) => {
          // Nombre de coordonnées demandées = source + destinations.
          const path = new URL(String(url)).pathname
          const coords = path.split('/driving/')[1]!.split(';')
          requested.push(coords.length - 1)
          return jsonResponse(osrmOk(Array(coords.length - 1).fill(4200)))
        }
      })
      await provider.tableFromOrigin(CENTER, [A])
      await provider.tableFromOrigin(CENTER, [A, B])
      // 1re fois : A seule. 2e fois : B seule (A vient du cache).
      expect(requested).toEqual([1, 1])
    } finally {
      h.close()
    }
  })

  it('aucun appel du tout quand toutes les destinations sont en cache', async () => {
    const h = createTestDb()
    try {
      let calls = 0
      const provider = createOsrmRouteProvider(h.db, {
        fetchFn: async () => {
          calls++
          return jsonResponse(osrmOk([4200]))
        }
      })
      await provider.tableFromOrigin(CENTER, [A])
      await provider.tableFromOrigin(CENTER, [A])
      expect(calls).toBe(1)
    } finally {
      h.close()
    }
  })

  it('OSRM en échec (HTTP 503) → l’appel lève, le seam de résolution repliera', async () => {
    const h = createTestDb()
    try {
      const provider = createOsrmRouteProvider(h.db, {
        fetchFn: async () => jsonResponse({}, 503)
      })
      await expect(provider.tableFromOrigin(CENTER, [A])).rejects.toThrow()
    } finally {
      h.close()
    }
  })

  it('timeout → lève (aucune attente infinie)', async () => {
    const h = createTestDb()
    try {
      const provider = createOsrmRouteProvider(h.db, {
        timeoutMs: 5,
        fetchFn: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          })
      })
      await expect(provider.tableFromOrigin(CENTER, [A])).rejects.toThrow()
    } finally {
      h.close()
    }
  })

  it('au-delà du plafond de coordonnées, les destinations en excès valent null', async () => {
    const h = createTestDb()
    try {
      const many = Array.from({ length: OSRM_MAX_DESTINATIONS + 5 }, (_v, i) => ({
        lat: 48.5 + i / 1000,
        lon: 2.1 + i / 1000
      }))
      let askedFor = 0
      const provider = createOsrmRouteProvider(h.db, {
        fetchFn: async (url) => {
          const coords = new URL(String(url)).pathname.split('/driving/')[1]!.split(';')
          askedFor = coords.length - 1
          return jsonResponse(osrmOk(Array(askedFor).fill(3000)))
        }
      })
      const distances = await provider.tableFromOrigin(CENTER, many)
      expect(askedFor).toBe(OSRM_MAX_DESTINATIONS)
      expect(distances).toHaveLength(many.length)
      expect(distances[OSRM_MAX_DESTINATIONS - 1]).toBe(3)
      expect(distances[OSRM_MAX_DESTINATIONS]).toBeNull()
      expect(distances.at(-1)).toBeNull()
    } finally {
      h.close()
    }
  })

  it('liste de destinations vide : aucun appel, tableau vide', async () => {
    const h = createTestDb()
    try {
      let calls = 0
      const provider = createOsrmRouteProvider(h.db, {
        fetchFn: async () => {
          calls++
          return jsonResponse(osrmOk([]))
        }
      })
      expect(await provider.tableFromOrigin(CENTER, [])).toEqual([])
      expect(calls).toBe(0)
    } finally {
      h.close()
    }
  })
})
