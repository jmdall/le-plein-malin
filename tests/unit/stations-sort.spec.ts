// tests/unit/stations-sort.spec.ts — Tri par défaut de la liste (ticket 011,
// spec §5.3 STA-2 : économie nette décroissante ; favoris en tête STA-4 ;
// référence et non rentables en bas). Fonction pure, aucune règle métier
// dupliquée : le serveur fournit les grandeurs, ce module ne trie que.
import { describe, expect, it } from 'vitest'
import { sortStations, type ListedStation } from '../../utils/stations'

function station(id: string, overrides: Partial<ListedStation> = {}): ListedStation {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    address: '1 rue X',
    city: 'Paris',
    postalCode: '75001',
    position: { lat: 48.86, lon: 2.34 },
    fuel: 'Gazole',
    price: 2.0,
    updatedAt: '2026-08-03T08:00:00Z',
    distanceKm: 5,
    isReference: false,
    economics: { detourCost: 0.5, grossSavings: 2, netSavings: 1.5 },
    freshness: { ageInHours: 2, status: 'fresh', score: 1 },
    ...overrides
  }
}

describe('sortStations (ticket 011, STA-2)', () => {
  it('tri par économie nette décroissante par défaut', () => {
    const a = station('a', { economics: { detourCost: 0, grossSavings: 1, netSavings: 1 } })
    const b = station('b', { economics: { detourCost: 0, grossSavings: 5, netSavings: 5 } })
    const c = station('c', { economics: { detourCost: 0, grossSavings: 3, netSavings: 3 } })

    const sorted = sortStations([a, b, c], [])
    expect(sorted.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('les favoris remontent en tête (STA-4), sans changer leur ordre relatif', () => {
    const a = station('a', { economics: { detourCost: 0, grossSavings: 1, netSavings: 1 } })
    const b = station('b', { economics: { detourCost: 0, grossSavings: 5, netSavings: 5 } })
    const c = station('c', { economics: { detourCost: 0, grossSavings: 3, netSavings: 3 } })

    const sorted = sortStations([a, b, c], ['a', 'c'])
    expect(sorted.map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('la station de référence descend en bas (elle est le point de comparaison)', () => {
    const ref = station('ref', { isReference: true, economics: { detourCost: null, grossSavings: null, netSavings: null } })
    const a = station('a', { economics: { detourCost: 0, grossSavings: 2, netSavings: 2 } })
    const b = station('b', { economics: { detourCost: 0, grossSavings: 4, netSavings: 4 } })

    const sorted = sortStations([ref, a, b], [])
    expect(sorted[sorted.length - 1]!.id).toBe('ref')
    expect(sorted[0]!.id).toBe('b')
  })

  it('les stations non rentables (net < 0) descendent en bas, avant la référence', () => {
    const ref = station('ref', { isReference: true, economics: { detourCost: null, grossSavings: null, netSavings: null } })
    const neg = station('neg', { economics: { detourCost: 3, grossSavings: 1, netSavings: -2 } })
    const pos = station('pos', { economics: { detourCost: 0, grossSavings: 2, netSavings: 2 } })

    const sorted = sortStations([ref, neg, pos], [])
    expect(sorted.map((s) => s.id)).toEqual(['pos', 'neg', 'ref'])
  })

  it('les favoris non rentables restent devant les non favoris (favoris prioritaire)', () => {
    const fav = station('fav', { economics: { detourCost: 3, grossSavings: 1, netSavings: -2 } })
    const nonFav = station('nf', { economics: { detourCost: 0, grossSavings: 2, netSavings: 2 } })

    const sorted = sortStations([nonFav, fav], ['fav'])
    expect(sorted.map((s) => s.id)).toEqual(['fav', 'nf'])
  })

  it('départage déterministe : prix puis distance puis id (égaux inclus)', () => {
    const a = station('a', { price: 2.0, distanceKm: 3 })
    const b = station('b', { price: 2.0, distanceKm: 1 })
    const c = station('c', { price: 1.9, distanceKm: 5 })

    const sorted = sortStations([a, b, c], [])
    expect(sorted.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('n’est jamais mutante (n’altère pas le tableau d’entrée)', () => {
    const a = station('a', { economics: { detourCost: 0, grossSavings: 1, netSavings: 1 } })
    const b = station('b', { economics: { detourCost: 0, grossSavings: 2, netSavings: 2 } })
    const input = [a, b]
    sortStations(input, [])
    expect(input.map((s) => s.id)).toEqual(['a', 'b'])
  })
})
