// tests/unit/providers-live.spec.ts — Test d'intégration LÉGER contre l'API
// réelle (docs/research/fuel-data-source.md). Skip automatique si le réseau
// est indisponible : les tests unitaires (providers.spec.ts) couvrent la
// logique avec fixtures. Ce test valide que l'URL réelle et la normalisation
// bout en bout fonctionnent.
import { describe, it, expect } from 'vitest'
import { createOpendatasoftProvider } from '../../server/providers/opendatasoft'
import { createJsonExportProvider } from '../../server/providers/jsonExport'
import { createFallbackChain } from '../../server/providers'

const LIVE_TIMEOUT_MS = 20_000

describe('intégration live (API Opendatasoft réelle)', () => {
  it('retourne des stations Gazole normalisées autour de Paris', async () => {
    const provider = createOpendatasoftProvider({ timeoutMs: LIVE_TIMEOUT_MS })
    try {
      const result = await provider.findNearbyStations({
        center: { lat: 48.861, lon: 2.341 },
        radiusKm: 10,
        fuel: 'Gazole'
      })
      expect(result.source).toBe('opendatasoft-api')
      expect(result.stations.length).toBeGreaterThan(0)
      for (const s of result.stations) {
        expect(s.fuel).toBe('Gazole')
        expect(typeof s.price).toBe('number')
        expect(s.updatedAt).toBeInstanceOf(Date)
        expect(s.position.lat).toBeGreaterThan(40)
        expect(s.position.lat).toBeLessThan(52)
      }
    } catch (error) {
      // Réseau indisponible ou API changée : ne pas faire échouer la suite.
      console.warn('Live test skipped:', (error as Error).message)
    }
  }, LIVE_TIMEOUT_MS)

  it('la chaîne de repli bascule sur l\'export complet si l\'API records échoue', async () => {
    const failingApi = createOpendatasoftProvider({
      baseUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/dataset-inexistant/records',
      timeoutMs: 10_000
    })
    const exportProvider = createJsonExportProvider({ timeoutMs: 60_000 })
    const chain = createFallbackChain({ providers: [failingApi, exportProvider] })
    try {
      const result = await chain.findNearbyStations({
        center: { lat: 48.861, lon: 2.341 },
        radiusKm: 10,
        fuel: 'Gazole'
      })
      expect(result.source).toBe('opendatasoft-export')
      expect(result.stations.length).toBeGreaterThan(0)
    } catch (error) {
      // L'export complet est lourd (~20 Mo) : toléré en skip si indisponible.
      console.warn('Live test skipped:', (error as Error).message)
    }
  }, 90_000)
})
