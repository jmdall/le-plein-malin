// tests/unit/map-recenter.spec.ts — Décision « faut-il recentrer la carte ? »
// (utils/mapRecenter.ts). Pendant une recherche déclenchée par un pan, les
// données intermédiaires portent encore l'ancien centre : la carte ne doit
// pas « revenir » dessus. Module pur, aucun DOM.
import { describe, expect, it } from 'vitest'
import { sameCenter, shouldRecenter, type RecenterInput } from '../../app/utils/mapRecenter'

const C1 = { lat: 48.8566, lon: 2.3522 }
const C2 = { lat: 48.85, lon: 2.35 }

function decide(overrides: Partial<RecenterInput> = {}) {
  return shouldRecenter({
    dataCenter: C1,
    panSearchCenter: null,
    lastFlownCenter: null,
    ...overrides
  })
}

describe('sameCenter', () => {
  it('compare strictement lat/lon', () => {
    expect(sameCenter(C1, C1)).toBe(true)
    expect(sameCenter(C1, C2)).toBe(false)
  })
})

describe('shouldRecenter', () => {
  it('recentre quand un nouveau centre de recherche arrive (pas de pan en cours)', () => {
    const d = decide({ dataCenter: C2, lastFlownCenter: C1 })
    expect(d.fly).toBe(true)
    expect(d.target).toEqual(C2)
  })

  it('recentre à l’init (lastFlownCenter null) quand les données portent un centre', () => {
    const d = decide({ dataCenter: C1, lastFlownCenter: null })
    expect(d.fly).toBe(true)
    expect(d.target).toEqual(C1)
  })

  it('ne fait rien quand les données portent déjà le centre de la carte', () => {
    const d = decide({ dataCenter: C1, lastFlownCenter: C1 })
    expect(d.fly).toBe(false)
    expect(d.target).toBeNull()
  })

  it('ne revient PAS sur l’ancien centre pendant une recherche par pan', () => {
    // L'utilisateur a déplacé la carte à C2 (panSearchCenter=C2) ; les
    // données intermédiaires portent encore C1 : on ne doit pas y revenir.
    const d = decide({ dataCenter: C1, panSearchCenter: C2, lastFlownCenter: C2 })
    expect(d.fly).toBe(false)
    expect(d.target).toBeNull()
  })

  it('recentre quand le centre des données rejoint le centre du pan (données C2 arrivées)', () => {
    const d = decide({ dataCenter: C2, panSearchCenter: C2, lastFlownCenter: C2 })
    expect(d.fly).toBe(false)
    expect(d.target).toBeNull()
  })

  it('ne fait rien sans centre de données', () => {
    const d = decide({ dataCenter: null })
    expect(d.fly).toBe(false)
    expect(d.target).toBeNull()
  })
})
