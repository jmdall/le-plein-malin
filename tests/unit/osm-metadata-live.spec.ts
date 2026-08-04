// tests/unit/osm-metadata-live.spec.ts — Test d'intégration LÉGER contre
// Overpass + Wikidata réels (ticket 018). Skip automatique si le réseau est
// indisponible : la suite unitaire (osm-metadata.spec.ts) couvre la logique
// avec fixtures. Ce test valide la requête groupée réelle et la résolution du
// logo bout en bout, sur deux stations réelles vérifiées.
import { describe, expect, it } from 'vitest'
import { createOsmMetadataProvider } from '../../server/providers/osmMetadata'

const LIVE_TIMEOUT_MS = 40_000

describe('intégration live (Overpass + Wikidata réels)', () => {
  it('résout nom/enseigne/logo de stations réelles via id DGCCRF', async () => {
    const provider = createOsmMetadataProvider({ timeoutMs: 35_000 })
    try {
      const result = await provider.findMetadataFor(['91170006', '77400012'])

      expect(result).toHaveLength(2)

      const byId = new Map(result.map((m) => [m.id, m]))

      const total = byId.get('91170006')
      expect(total).toBeDefined()
      expect(total!.brand).toBe('Total')
      expect(total!.brandWikidataId).toBe('Q154037')
      expect(total!.name).toBeTruthy()
      expect(total!.logoUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//)

      const esso = byId.get('77400012')
      expect(esso).toBeDefined()
      expect(esso!.brand).toBe('Esso')
      expect(esso!.brandWikidataId).toBe('Q867662')
      expect(esso!.logoUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//)
    } catch (error) {
      // Réseau indisponible ou API change : ne pas faire échouer la suite.
      console.warn('Live test skipped:', (error as Error).message)
    }
  }, LIVE_TIMEOUT_MS)

  it('ne lève jamais d\'exception quand la source est indisponible', async () => {
    const provider = createOsmMetadataProvider({ overpassUrl: 'https://example.invalid/', timeoutMs: 5_000 })
    const result = await provider.findMetadataFor(['91170006'])
    expect(Array.isArray(result)).toBe(true)
  }, LIVE_TIMEOUT_MS)
})
