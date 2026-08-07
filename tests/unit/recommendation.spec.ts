import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculateFuelRecommendation } from '../../domain/recommendation/calculate'
import type { FuelRecommendation } from '../../domain/recommendation/types'
import type { CandidateWithDistance } from '../../domain/stations/types'
import type { StationPrice } from '../../domain/fuel-prices/types'
import type { VehicleProfile } from '../../domain/vehicle/types'

// Toutes les valeurs attendues sont des littéraux indépendants (fixture :
// réservoir 60 L, niveau 20 L, conso 6,4 L/100 km, seuil 1 € par défaut).
// Les distances de détour sont fournies en entrée, déjà calculées côté serveur
// (D2/D3) — le module ne fait jamais de géométrie.

const NOW = new Date('2026-08-03T12:00:00.000Z')
const HOUR_MS = 3_600_000

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR_MS)
}

function station(overrides: Partial<StationPrice> & { id: string }): StationPrice {
  return {
    name: `Station ${overrides.id}`,
    brand: null,
    address: '1 rue du Test',
    city: 'Testville',
    postalCode: '75000',
    position: { lat: 48.8, lon: 2.3 },
    fuel: 'Gazole',
    price: 1.8,
    updatedAt: NOW,
    ...overrides
  }
}

function vehicle(overrides: Partial<VehicleProfile> = {}): VehicleProfile {
  return {
    fuel: 'Gazole',
    consumption: 6.4,
    tankCapacity: 60,
    currentLevel: 20,
    preferredQuantity: null,
    savingsThreshold: 1,
    ...overrides
  }
}

function candidate(
  id: string,
  price: number,
  detourDistanceKm: number,
  overrides: Partial<StationPrice> = {}
): CandidateWithDistance {
  return { station: station({ id, price, ...overrides }), detourDistanceKm }
}

function makeInput(overrides: {
  candidates?: CandidateWithDistance[]
  referenceStation?: StationPrice
  quantityToBuy?: number
  vehicle?: VehicleProfile
  threshold?: number
  trend?: { direction: 'down' | 'stable' | 'up' | 'insufficient'; magnitude: number }
  hasGeoLocation?: boolean
} = {}) {
  const reference = overrides.referenceStation ?? station({ id: 'ref', price: 1.95 })
  return {
    fuelType: reference.fuel,
    quantityToBuy: overrides.quantityToBuy ?? 30,
    vehicle: overrides.vehicle ?? vehicle(),
    referenceStation: reference,
    candidates: overrides.candidates ?? [candidate('A', 1.8, 2.4)],
    threshold: overrides.threshold ?? 1,
    trend: overrides.trend ?? { direction: 'stable' as const, magnitude: 0.02 },
    hasGeoLocation: overrides.hasGeoLocation ?? true,
    now: NOW
  }
}

describe('calculateFuelRecommendation (ticket 004, 18 scénarios §13)', () => {
  describe('#1 — détour non rentable', () => {
    it('économie nette < seuil → jamais go-to-station ; netSavings/detourCost présents', () => {
      // conso 10 L/100 km, prix réf 1.95, candidate 1.9, détour 10 km :
      // coût détour = 10 × 0.1 × 1.9 = 1.9 € ; brute = 0.05 × 30 = 1.5 € ;
      // nette = −0.4 € < seuil 1 € → non rentable.
      const r = calculateFuelRecommendation(
        makeInput({
          vehicle: vehicle({ consumption: 10 }),
          candidates: [candidate('loin', 1.9, 10)]
        })
      )
      expect(r.type).not.toBe('go-to-station')
      expect(['fill-now', 'wait', 'partial-fill']).toContain(r.type)
      expect(r.netSavings).toBeTypeOf('number')
      expect(r.detourCost).toBeTypeOf('number')
      expect(r.detourCost).toBeGreaterThan(0)
      expect(r.netSavings).toBeLessThan(1)
    })
  })

  describe('#2 — détour rentable', () => {
    it('économie nette ≥ seuil et netSavings maximal → go-to-station, recommendedStation = candidat', () => {
      const r = calculateFuelRecommendation(makeInput())
      expect(r.type).toBe('go-to-station')
      expect(r.recommendedStation?.id).toBe('A')
      expect(r.netSavings).toBeGreaterThan(0)
      expect(r.netSavings).toBeGreaterThanOrEqual(1)
      expect(r.referenceStation?.id).toBe('ref')
      expect(r.quantityToBuy).toBe(30)
    })

    it('parmi plusieurs candidats, recommendedStation = meilleure économie nette', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          candidates: [
            candidate('chere', 1.9, 0.4),
            candidate('mieux', 1.7, 2.6),
            candidate('hors-zone', 1.8, 5)
          ]
        })
      )
      expect(r.type).toBe('go-to-station')
      expect(r.recommendedStation?.id).toBe('mieux')
      expect(r.recommendedStation?.price).toBe(1.7)
    })
  })

  describe('#3 — économie exactement égale au seuil', () => {
    it('économie nette === seuil → go-to-station (seuil strict ≥, CAL-3)', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          referenceStation: station({ id: 'ref', price: 2.0 }),
          candidates: [candidate('egalite', 1.875, 0)],
          quantityToBuy: 16,
          threshold: 2
        })
      )
      expect(r.type).toBe('go-to-station')
      expect(r.recommendedStation?.id).toBe('egalite')
      expect(r.netSavings).toBe(2)
    })
  })

  describe('#4 — prix de plus de 24 heures', () => {
    it('candidate stale (30 h) seule → stale, score < 1, toujours éligible, isPartial', () => {
      // référence à 30 h (prix de comparaison stale) + candidate fraîche non
      // rentable → wait avec freshness stale, isPartial.
      const r = calculateFuelRecommendation(
        makeInput({
          referenceStation: station({ id: 'ref', price: 1.95, updatedAt: hoursAgo(30) }),
          vehicle: vehicle({ consumption: 10 }),
          candidates: [candidate('egal', 1.95, 0, { updatedAt: NOW })]
        })
      )
      expect(r.freshness.status).toBe('stale')
      expect(r.freshness.score).toBeLessThan(1)
      expect(r.isPartial).toBe(true)
      expect(r.type).not.toBe('insufficient-data')
    })

    it('stale exclue dès qu’une alternative fraîche existe', () => {
      // fraiche (1.78) → brute 5.1 − détour 0.31 = 4.79 ≥ 1 → rentable ;
      // stale (1.7) → netSavings 5.46 (plus grand) mais exclue car fraîche dispo.
      const r = calculateFuelRecommendation(
        makeInput({
          candidates: [
            candidate('fraiche', 1.78, 2.4),
            candidate('stale', 1.7, 2.4, { updatedAt: hoursAgo(30) })
          ]
        })
      )
      expect(r.type).toBe('go-to-station')
      expect(r.recommendedStation?.id).toBe('fraiche')
    })
  })

  describe('#5 — prix de plus de 48 heures', () => {
    it('candidate obsolete (50 h) → exclue par défaut, ignorée', () => {
      const r = calculateFuelRecommendation(
        makeInput({ candidates: [candidate('obsolete', 1.6, 2.4, { updatedAt: hoursAgo(50) })] })
      )
      expect(r.recommendedStation).toBeNull()
      expect(r.ignoredData.join(' ')).toContain('> 48 h')
      expect(r.type).not.toBe('go-to-station')
    })

    it('obsolete (50 h) + fraîche (30 min) → seule la fraîche est candidate', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          candidates: [
            candidate('fraiche', 1.8, 2.4),
            candidate('obsolete', 1.6, 2.4, { updatedAt: hoursAgo(50) })
          ]
        })
      )
      expect(r.recommendedStation?.id).toBe('fraiche')
      expect(r.ignoredData.join(' ')).toContain('> 48 h')
    })
  })

  describe('#6 — station sans carburant sélectionné (CAR-3)', () => {
    it('aucun candidat (pas de prix pour ce carburant) → insufficient-data avec suggestions', () => {
      const r = calculateFuelRecommendation(makeInput({ candidates: [] }))
      expect(r.type).toBe('insufficient-data')
      expect(r.reasons.join(' ')).toMatch(/aucune station/i)
      expect(r.assumptions.join(' ')).toMatch(/élargir le rayon/i)
      expect(r.assumptions.join(' ')).toMatch(/changer de carburant/i)
      expect(r.isPartial).toBe(true)
    })
  })

  describe('#7 — historique insuffisant (TRE-4 / D4)', () => {
    it('tendance insufficient → isPartial, décision sur les prix courants', () => {
      const r = calculateFuelRecommendation(makeInput({ trend: { direction: 'insufficient', magnitude: 0 } }))
      expect(r.isPartial).toBe(true)
      expect(r.reasons.join(' ')).toMatch(/historique/i)
      expect(r.type).not.toBe('insufficient-data')
      expect(r.netSavings).toBeTypeOf('number')
    })
  })

  describe('#8 — réservoir presque vide', () => {
    it('niveau ≤ 10 % capacité → fill-now même si tendance baissière', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          vehicle: vehicle({ currentLevel: 5 }),
          candidates: [candidate('egal', 1.95, 0)],
          trend: { direction: 'down', magnitude: 0.05 }
        })
      )
      expect(r.type).toBe('fill-now')
      expect(r.reasons.join(' ')).toMatch(/réservoir/i)
    })
  })

  describe('tendance réelle dans la formulation (REC-4, C1 revue /code-review)', () => {
    it('trend down → « Tendance probable à la baisse », jamais « stable » en dur', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          vehicle: vehicle({ currentLevel: 30 }),
          candidates: [candidate('egal', 1.95, 0)],
          trend: { direction: 'down', magnitude: 0.04 }
        })
      )
      expect(r.reasons.join(' ')).toMatch(/baisse/i)
      expect(r.reasons.join(' ')).not.toMatch(/stable/)
    })

    it('trend up → « Tendance probable à la hausse »', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          vehicle: vehicle({ currentLevel: 30 }),
          candidates: [candidate('egal', 1.95, 0)],
          trend: { direction: 'up', magnitude: 0.04 }
        })
      )
      expect(r.reasons.join(' ')).toMatch(/hausse/i)
    })

    it('sans signal → « Tendance probable stable » par défaut', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          vehicle: vehicle({ currentLevel: 30 }),
          candidates: [candidate('egal', 1.95, 0)]
        })
      )
      expect(r.reasons.join(' ')).toMatch(/stable/i)
    })
  })

  describe('#9 — réservoir presque plein', () => {
    it('niveau élevé sans besoin → wait, jamais fill-now', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          vehicle: vehicle({ currentLevel: 55 }),
          candidates: [candidate('egal', 1.95, 0)]
        })
      )
      expect(r.type).toBe('wait')
      expect(r.type).not.toBe('fill-now')
    })
  })

  describe('#10 — quantité supérieure à la capacité disponible', () => {
    it('quantityToBuy bornée à capacité − niveau ; jamais de dépassement', () => {
      const r = calculateFuelRecommendation(
        makeInput({ vehicle: vehicle({ currentLevel: 10 }), quantityToBuy: 60 })
      )
      expect(r.type).toBe('go-to-station')
      expect(r.quantityToBuy).toBe(50)
      expect(r.quantityToBuy).toBeLessThanOrEqual(50)
    })
  })

  describe('#11 — quantité nulle', () => {
    it('quantité souhaitée = 0 → pas de détour rentable → wait, jamais go-to-station', () => {
      const r = calculateFuelRecommendation(makeInput({ quantityToBuy: 0 }))
      expect(r.type).not.toBe('go-to-station')
      expect(r.type).toBe('wait')
    })
  })

  describe('#12 — consommation invalide', () => {
    it('consumption ≤ 0 → insufficient-data ; jamais de detourCost invalide', () => {
      const r = calculateFuelRecommendation(makeInput({ vehicle: vehicle({ consumption: 0 }) }))
      expect(r.type).toBe('insufficient-data')
      expect(r.detourCost).toBeNull()
    })
  })

  describe('#13 — plusieurs stations au même prix (départage déterministe)', () => {
    it('deux candidates identiques en tout → le plus petit id gagne', () => {
      const r = calculateFuelRecommendation(
        makeInput({ candidates: [candidate('b', 1.8, 2.4), candidate('a', 1.8, 2.4)] })
      )
      expect(r.recommendedStation?.id).toBe('a')
    })

    it('classement stable et reproductible entre deux exécutions', () => {
      const input = makeInput({
        candidates: [candidate('c', 1.8, 2.4), candidate('a', 1.8, 2.4), candidate('b', 1.8, 2.4)]
      })
      const r1 = calculateFuelRecommendation(input)
      const r2 = calculateFuelRecommendation(input)
      expect(r1.recommendedStation?.id).toBe('a')
      expect(r2.recommendedStation?.id).toBe('a')
    })
  })

  describe('#14 — données incohérentes', () => {
    it('niveau > capacité → jamais d’exception, recommandation dégradée (isPartial)', () => {
      let r: FuelRecommendation | undefined
      expect(() => {
        r = calculateFuelRecommendation(makeInput({ vehicle: vehicle({ currentLevel: 70 }) }))
      }).not.toThrow()
      expect(r?.isPartial).toBe(true)
      expect(r?.type).toBeDefined()
    })
  })

  describe('#15 — prix aberrant', () => {
    it('prix hors intervalle documenté → ignoredData, exclu du calcul, jamais inventé', () => {
      const r = calculateFuelRecommendation(
        makeInput({
          candidates: [candidate('aberrant', 0.3, 2.4), candidate('normal', 1.8, 2.4)]
        })
      )
      expect(r.recommendedStation?.id).toBe('normal')
      expect(r.ignoredData.join(' ')).toMatch(/aberrant/i)
    })
  })

  describe('#16 — absence de géolocalisation (D2 / ADR-0002)', () => {
    it('hypothèse détour ligne droite A/R documentée, isPartial (perte de précision)', () => {
      const r = calculateFuelRecommendation(makeInput({ hasGeoLocation: false }))
      expect(r.assumptions.join(' ')).toMatch(/aller-retour/i)
      expect(r.assumptions.join(' ')).toMatch(/ligne droite/i)
      expect(r.isPartial).toBe(true)
    })
  })

  describe('#17 — échec de la source officielle', () => {
    it('aucun prix utilisable → insufficient-data, aucun prix inventé, suggestions', () => {
      const r = calculateFuelRecommendation(
        makeInput({ candidates: [candidate('obsolete', 1.6, 2.4, { updatedAt: hoursAgo(50) })] })
      )
      expect(r.type).toBe('insufficient-data')
      expect(r.reasons.join(' ')).toMatch(/insuffisant/i)
      expect(r.assumptions.join(' ')).toMatch(/élargir le rayon/i)
    })
  })

  describe('#18 — données en cache / absence de station proche', () => {
    it('(b) aucun candidat dans le rayon → insufficient-data avec suggestions', () => {
      const r = calculateFuelRecommendation(makeInput({ candidates: [] }))
      expect(r.type).toBe('insufficient-data')
      expect(r.assumptions.join(' ')).toMatch(/élargir le rayon/i)
      expect(r.assumptions.join(' ')).toMatch(/changer de carburant/i)
    })
  })

  describe('partial-fill (D5) — « Mets seulement X litres »', () => {
    it('X = quantité minimale rentabilisant le détour (seuil + coût détour), bornée par le volume disponible', () => {
      // réf 2.0, candidate 1.7 (diff 0.30 €/L), détour 5 km, conso 10 :
      // coût détour = 5 × 0.1 × 1.7 = 0.85 €.
      // quantité minimale = ⌈(seuil 1 + 0.85) / 0.30⌉ = ⌈6.17⌉ = 7 L.
      // quantityToBuy = 5 (ce que l'utilisateur comptait mettre) : plein 5 L →
      // brute 1.5, nette 0.65 < 1 → pas go-to-station → partial-fill X = 7 ≤ available 40.
      const r = calculateFuelRecommendation(
        makeInput({
          referenceStation: station({ id: 'ref', price: 2.0 }),
          vehicle: vehicle({ consumption: 10 }),
          candidates: [candidate('loin', 1.7, 5)],
          quantityToBuy: 5,
          threshold: 1
        })
      )
      expect(r.type).toBe('partial-fill')
      expect(r.quantityToBuy).toBe(7)
      expect(r.recommendedStation?.id).toBe('loin')
      // « Mets seulement X litres » est une recommandation COMPLÈTE : isPartial
      // n'est vrai que si une donnée manque (C3 revue /code-review).
      expect(r.isPartial).toBe(false)
    })

    it('borné par capacité − niveau : si même le plein complet ne rentabilise pas → wait', () => {
      // niveau 57 → disponible 3 L < quantité minimale 4 L → le plein ne
      // rentabilise pas → wait, jamais partial-fill.
      const r = calculateFuelRecommendation(
        makeInput({
          referenceStation: station({ id: 'ref', price: 2.0 }),
          vehicle: vehicle({ consumption: 10, currentLevel: 57 }),
          candidates: [candidate('loin', 1.5, 5)],
          quantityToBuy: 5,
          threshold: 1
        })
      )
      expect(r.type).not.toBe('partial-fill')
    })

    it('X borné par preferredQuantity si renseignée', () => {
      // réf 2.0, candidate 1.5 (diff 0.50 €/L), détour 5 km, conso 10 :
      // coût détour = 5 × 0.1 × 1.5 = 0.75 €.
      // quantityToBuy = 3 → plein 3 L : brute 1.5, nette 0.75 < 1 → pas rentable.
      // minQ = ⌈(1 + 0.75)/0.50⌉ = 4 L ; preferredQuantity = 4 → X = min(4, available, 4) = 4.
      const r = calculateFuelRecommendation(
        makeInput({
          referenceStation: station({ id: 'ref', price: 2.0 }),
          vehicle: vehicle({ consumption: 10, preferredQuantity: 4 }),
          candidates: [candidate('loin', 1.5, 5)],
          quantityToBuy: 3,
          threshold: 1
        })
      )
      expect(r.type).toBe('partial-fill')
      expect(r.quantityToBuy).toBe(4)
    })
  })

  describe('pureté du module (ticket 004)', () => {
    it('calculate.ts ne doit jamais importer Nuxt, HTTP, SQLite ou process.env', () => {
      const files = ['domain/recommendation/calculate.ts', 'domain/recommendation/types.ts']
      const forbidden = [
        'nuxt',
        '#app',
        'nitropack',
        'h3',
        'ofetch',
        'process.env',
        'sqlite',
        'drizzle',
        'server/db'
      ]
      for (const file of files) {
        const source = readFileSync(join(__dirname, '../../', file), 'utf8')
        const importLines = source.split('\n').filter((line) => /^\s*import/.test(line))
        for (const line of importLines) {
          for (const pattern of forbidden) {
            expect(line, `${file} : import interdit "${pattern}" (${line.trim()})`).not.toContain(pattern)
          }
        }
      }
    })
  })

  describe('critères transverses (ticket 004)', () => {
    it('tous les champs du type FuelRecommendation sont remplis', () => {
      const r = calculateFuelRecommendation(makeInput())
      expect(r.confidence).toBeGreaterThan(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
      expect(Array.isArray(r.reasons)).toBe(true)
      expect(Array.isArray(r.usedData)).toBe(true)
      expect(Array.isArray(r.ignoredData)).toBe(true)
      expect(Array.isArray(r.calculations)).toBe(true)
      expect(Array.isArray(r.assumptions)).toBe(true)
      expect(typeof r.isPartial).toBe('boolean')
      expect(r.freshness).toBeTypeOf('object')
    })

    it('la tendance n’est jamais formulée comme une certitude (REC-4)', () => {
      const r = calculateFuelRecommendation(makeInput())
      const allText = [...r.reasons, ...r.usedData].join(' ').toLowerCase()
      expect(allText).not.toMatch(/prix vont baisser/)
      expect(allText).not.toMatch(/le prix va hausser/)
      expect(allText).not.toMatch(/prix vont monter/)
    })
  })
})
