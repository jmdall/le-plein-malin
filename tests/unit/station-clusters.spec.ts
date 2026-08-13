// tests/unit/station-clusters.spec.ts — Regroupement des marqueurs de carte
// qui se chevauchent (demande produit : « regrouper les stations, il y en a
// trop sur des petits périmètres » ; choix produit : clustering dynamique
// selon le zoom ; design ui-reference.md §5 « Clusters — disques pleins
// terracotta avec le nombre de stations »).
//
// Module client pur, sans Leaflet : il décide, pour un rayon d'agrégation
// donné (dérivé du zoom par la carte), quels marqueurs sont regroupés
// (centroïde + nombre) et lesquels restent individuels. La station de
// référence et la station recommandée ne sont JAMAIS regroupées : ce sont les
// points d'ancrage de l'écran (la réponse produit ne doit jamais être enfouie
// dans un cluster).
import { describe, expect, it } from 'vitest'
import {
  buildStationClusters,
  CLUSTER_BASE_RADIUS_KM,
  CLUSTER_BASE_ZOOM,
  clusterRadiusKmForZoom
} from '../../app/utils/stationClusters'
import type { StationMapMarker } from '../../app/utils/stationMap'
import { haversineKm } from '../../domain/fuel-prices/haversine'

function marker(
  id: string,
  lat: number,
  lon: number,
  overrides: Partial<StationMapMarker> = {}
): StationMapMarker {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    logoUrl: null,
    lat,
    lon,
    isReference: false,
    isRecommended: false,
    price: 2.0,
    priceLabel: '2,000 €/L',
    markerPriceLabel: '2,000',
    distanceLabel: '1,2 km',
    freshnessLabel: 'frais',
    ageLabel: '',
    isStale: false,
    attractiveness: null,
    directionsUrl: 'https://www.openstreetmap.org/directions?from=&to=',
    ...overrides
  }
}

// La distance entre deux marqueurs colinéaires le long d'une latitude (lon
// fixé) à 48.85° : 1° de latitude ≈ 111.19 km. On utilise cette base pour
// placer les points à des distances reproductibles.
function alongLat(baseLat: number, km: number): number {
  return baseLat + km / 111.19
}

describe('clusterRadiusKmForZoom (seuil dynamique selon le zoom)', () => {
  it('divise le rayon par 2 à chaque niveau de zoom supplémentaire', () => {
    expect(clusterRadiusKmForZoom(CLUSTER_BASE_ZOOM)).toBe(CLUSTER_BASE_RADIUS_KM)
    expect(clusterRadiusKmForZoom(CLUSTER_BASE_ZOOM + 1)).toBeCloseTo(CLUSTER_BASE_RADIUS_KM / 2, 10)
    expect(clusterRadiusKmForZoom(CLUSTER_BASE_ZOOM - 1)).toBeCloseTo(CLUSTER_BASE_RADIUS_KM * 2, 10)
  })
})

describe('buildStationClusters (clustering des marqueurs superposés)', () => {
  it('laisse un marqueur isolé non groupé', () => {
    const view = buildStationClusters([marker('a', 48.85, 2.35)], CLUSTER_BASE_RADIUS_KM)
    expect(view.clusters).toHaveLength(0)
    expect(view.individuals).toEqual(['a'])
  })

  it('regroupe les marqueurs séparés de moins de 2 km et laisse les autres individuels', () => {
    const view = buildStationClusters(
      [
        marker('a', 48.85, 2.35),
        marker('b', 48.8515, 2.3515),
        marker('c', 48.88, 2.37)
      ],
      CLUSTER_BASE_RADIUS_KM
    )
    expect(view.clusters).toHaveLength(1)
    expect(view.individuals).toEqual(['c'])
    const cluster = view.clusters[0]!
    expect(cluster.markerIds.sort()).toEqual(['a', 'b'])
    // Centroïde des coordonnées des marqueurs groupés.
    expect(cluster.lat).toBeCloseTo((48.85 + 48.8515) / 2, 10)
    expect(cluster.lon).toBeCloseTo((2.35 + 2.3515) / 2, 10)
  })

  it('groupe en chaîne : un marqueur absorbé par un cluster dont le centroïde est proche, sans être adjacent au premier', () => {
    // a──b = 1,98 km ; b──c = 0,06 km ; a──c = 2,04 km (aucun seuil direct
    // a-c) : c est absorbé parce que le centroïde (a,b) est à 1,05 km.
    const a = { lat: 48.85, lon: 2.35 }
    const b = { lat: alongLat(48.85, 1.98), lon: 2.35 }
    const centroid = alongLat(48.85, 0.99)
    const c = { lat: alongLat(centroid, 1.05), lon: 2.35 }
    const view = buildStationClusters(
      [marker('a', a.lat, a.lon), marker('b', b.lat, b.lon), marker('c', c.lat, c.lon)],
      CLUSTER_BASE_RADIUS_KM
    )
    expect(view.clusters).toHaveLength(1)
    expect(view.clusters[0]!.markerIds.sort()).toEqual(['a', 'b', 'c'])
  })

  it('crée deux clusters distincts quand les groupes sont éloignés', () => {
    const view = buildStationClusters(
      [
        marker('a', 48.85, 2.35),
        marker('b', 48.8515, 2.3515),
        marker('c', 48.9, 2.5),
        marker('d', 48.9015, 2.5015)
      ],
      CLUSTER_BASE_RADIUS_KM
    )
    expect(view.clusters).toHaveLength(2)
    const groups = view.clusters.map((c) => [...c.markerIds].sort()).sort()
    expect(groups).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('ne regroupe jamais la station de référence ni la recommandée, qui restent individuelles', () => {
    const ref = marker('ref', 48.85, 2.35)
    ref.isReference = true
    const reco = marker('reco', 48.8515, 2.3515)
    reco.isRecommended = true
    const a = marker('a', 48.852, 2.352)
    const b = marker('b', 48.853, 2.353)
    const view = buildStationClusters([ref, reco, a, b], CLUSTER_BASE_RADIUS_KM)
    // a et b (tout proches l'un de l'autre) sont groupés ; ref et reco
    // restent individuelles même si elles sont dans le même amas : leur
    // badge est le point d'ancrage de l'écran, jamais enfoui dans un
    // cluster.
    expect(view.clusters).toHaveLength(1)
    expect(view.clusters[0]!.markerIds.sort()).toEqual(['a', 'b'])
    expect(view.individuals.sort()).toEqual(['reco', 'ref'])
  })

  it('sans marqueur → aucun cluster', () => {
    const view = buildStationClusters([], CLUSTER_BASE_RADIUS_KM)
    expect(view.clusters).toHaveLength(0)
    expect(view.individuals).toEqual([])
  })

  it('le cluster porte l’attractivité de sa station la plus « verte » (max du groupe)', () => {
    const cheap = marker('a', 48.85, 2.35)
    cheap.attractiveness = 0.9
    const mid = marker('b', 48.8515, 2.3515)
    mid.attractiveness = 0.3
    const pricey = marker('c', 48.852, 2.352)
    pricey.attractiveness = 0.15
    const view = buildStationClusters([cheap, mid, pricey], CLUSTER_BASE_RADIUS_KM)
    expect(view.clusters).toHaveLength(1)
    // Le disque suit le MEILLEUR prix du groupe (le plus « vert »).
    expect(view.clusters[0]!.attractiveness).toBeCloseTo(0.9, 6)
  })

  it('une attractivité inconnue (null) ne dégrade pas le cluster', () => {
    const known = marker('a', 48.85, 2.35)
    known.attractiveness = 0.8
    const unknown = marker('b', 48.8515, 2.3515)
    unknown.attractiveness = null
    const view = buildStationClusters([known, unknown], CLUSTER_BASE_RADIUS_KM)
    expect(view.clusters).toHaveLength(1)
    expect(view.clusters[0]!.attractiveness).toBeCloseTo(0.8, 6)
  })

  it('sans aucune attractivité connue → cluster neutre (null)', () => {
    const a = marker('a', 48.85, 2.35)
    const b = marker('b', 48.8515, 2.3515)
    const view = buildStationClusters([a, b], CLUSTER_BASE_RADIUS_KM)
    expect(view.clusters).toHaveLength(1)
    expect(view.clusters[0]!.attractiveness).toBeNull()
  })
})

// ——— Ticket 034 : le cluster porte le meilleur prix de son groupe ———
// Le MINIMUM, pas la moyenne : le disque porte déjà le dégradé de sa station la
// moins chère, donc afficher une moyenne ferait dire deux choses au même
// disque. Et c'est le meilleur prix qui déclenche un détour.
describe('minPrice du cluster (ticket 034)', () => {
  // 0.005° de latitude ≈ 0.56 km : bien en dessous du rayon de fusion de 2 km.
  const near = (id: string, overrides: Partial<StationMapMarker> = {}) =>
    marker(id, 48.85, 2.35, overrides)

  it('le cluster porte le prix le PLUS BAS de son groupe', () => {
    const markers = [
      near('a', { price: 1.949, lat: 48.85 }),
      near('b', { price: 1.712, lat: 48.851 }),
      near('c', { price: 1.83, lat: 48.852 })
    ]
    const { clusters } = buildStationClusters(markers, 2)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.markerIds).toHaveLength(3)
    expect(clusters[0]!.minPrice).toBe(1.712)
  })

  // CONTEXT.md §Fraîcheur : annoncer « dès X € » sur un prix de trois jours
  // serait exactement la promesse que l'app refuse de faire.
  it('un prix périmé (> 24 h) ne peut pas fournir le prix affiché', () => {
    const markers = [
      near('frais', { price: 1.949, lat: 48.85 }),
      near('perime', { price: 1.5, isStale: true, lat: 48.851 })
    ]
    const { clusters } = buildStationClusters(markers, 2)
    expect(clusters[0]!.minPrice).toBe(1.949)
  })

  it('groupe entièrement périmé → minPrice null (le nombre reste, pas de prix)', () => {
    const markers = [
      near('p1', { price: 1.5, isStale: true, lat: 48.85 }),
      near('p2', { price: 1.6, isStale: true, lat: 48.851 })
    ]
    const { clusters } = buildStationClusters(markers, 2)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.minPrice).toBeNull()
  })

  it('un prix non fini n’est jamais retenu', () => {
    const markers = [
      near('nan', { price: Number.NaN, lat: 48.85 }),
      near('ok', { price: 1.8, lat: 48.851 })
    ]
    const { clusters } = buildStationClusters(markers, 2)
    expect(clusters[0]!.minPrice).toBe(1.8)
  })

  it('deux clusters distincts portent chacun le minimum de SON groupe', () => {
    const markers = [
      marker('a1', 48.85, 2.35, { price: 1.9 }),
      marker('a2', 48.851, 2.35, { price: 1.75 }),
      // ~11 km plus au nord : hors du rayon de fusion de 2 km.
      marker('b1', 48.95, 2.35, { price: 1.99 }),
      marker('b2', 48.951, 2.35, { price: 1.88 })
    ]
    const { clusters } = buildStationClusters(markers, 2)
    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.minPrice).sort()).toEqual([1.75, 1.88])
  })
})

// ——— Ticket 036 : indexation spatiale (grille) ———
// buildStationClusters comparait chaque marqueur à TOUS les clusters formés
// (O(n·k)) : 4,3 s pour 9 500 stations au zoom 10, donc l'exploration libre de
// la carte (ticket 038) était impossible. La grille ne change PAS le résultat,
// seulement le nombre de candidats examinés : la garantie est qu'un cluster à
// moins de R se trouve forcément dans l'une des 9 cellules voisines.

// Jeu pseudo-aléatoire DÉTERMINISTE sur la France métropolitaine (pas de
// Math.random : un test de clustering doit être reproductible).
function spreadMarkers(n: number): StationMapMarker[] {
  const out: StationMapMarker[] = []
  for (let i = 0; i < n; i++) {
    const a = (i * 2654435761) % 4294967296
    const b = (i * 1597334677) % 4294967296
    out.push(
      marker(`s${i}`, 42.5 + (a / 4294967296) * 8.5, -4 + (b / 4294967296) * 13, {
        price: 1.6 + (a % 500) / 1000,
        attractiveness: (b % 1000) / 1000
      })
    )
  }
  return out
}

// Implémentation NAÏVE de référence : exactement l'algorithme d'avant le ticket
// 036 (chaque marqueur contre tous les clusters). Elle sert d'oracle.
function naiveClusters(markers: StationMapMarker[], mergeRadiusKm: number) {
  const clusters: Array<{
    markerIds: string[]
    lat: number
    lon: number
    attractiveness: number | null
    minPrice: number | null
  }> = []
  const fresh = (m: StationMapMarker) =>
    m.isStale || !Number.isFinite(m.price) ? null : m.price

  for (const m of markers) {
    if (m.isReference || m.isRecommended) continue
    let target: (typeof clusters)[number] | null = null
    let best = Infinity
    for (const c of clusters) {
      const d = haversineKm({ lat: m.lat, lon: m.lon }, { lat: c.lat, lon: c.lon })
      if (d <= mergeRadiusKm && d < best) {
        target = c
        best = d
      }
    }
    if (target) {
      target.markerIds.push(m.id)
      const total = target.markerIds.length
      target.lat = (target.lat * (total - 1) + m.lat) / total
      target.lon = (target.lon * (total - 1) + m.lon) / total
      if (m.attractiveness !== null) {
        target.attractiveness = Math.max(target.attractiveness ?? -Infinity, m.attractiveness)
      }
      const p = fresh(m)
      if (p !== null) target.minPrice = Math.min(target.minPrice ?? Infinity, p)
    } else {
      clusters.push({
        markerIds: [m.id],
        lat: m.lat,
        lon: m.lon,
        attractiveness: m.attractiveness,
        minPrice: fresh(m)
      })
    }
  }
  return clusters.filter((c) => c.markerIds.length > 1)
}

describe('buildStationClusters — indexation spatiale (ticket 036)', () => {
  // La preuve de non-régression : même résultat que l'oracle naïf, à la
  // virgule près, sur un jeu assez dense pour créer des cas limites.
  it('donne EXACTEMENT le même résultat que l’implémentation naïve', () => {
    for (const [n, radius] of [
      [400, 8],
      [400, 20],
      [900, 5],
      // Échelle réelle : c'est là que la garantie des 9 cellules se joue
      // vraiment (une cellule trop étroite en km laisserait échapper un
      // cluster à moins de R, et le résultat divergerait de l'oracle).
      [9500, 16]
    ] as const) {
      const markers = spreadMarkers(n)
      const actual = buildStationClusters(markers, radius).clusters
      const expected = naiveClusters(markers, radius)

      expect(actual.length, `n=${n} r=${radius}`).toBe(expected.length)
      const key = (c: { markerIds: string[] }) => c.markerIds.slice().sort().join(',')
      const actualByKey = new Map(actual.map((c) => [key(c), c]))
      for (const want of expected) {
        const got = actualByKey.get(key(want))
        expect(got, `groupe ${key(want)} (n=${n} r=${radius})`).toBeDefined()
        expect(got!.lat).toBeCloseTo(want.lat, 9)
        expect(got!.lon).toBeCloseTo(want.lon, 9)
        expect(got!.attractiveness).toBe(want.attractiveness)
        expect(got!.minPrice).toBe(want.minPrice)
      }
    }
  })

  it('les individuels sont les mêmes que ceux de l’implémentation naïve', () => {
    const markers = spreadMarkers(600)
    const view = buildStationClusters(markers, 10)
    const clustered = new Set(naiveClusters(markers, 10).flatMap((c) => c.markerIds))
    const expected = markers.filter((m) => !clustered.has(m.id)).map((m) => m.id)
    expect(view.individuals).toEqual(expected)
  })

  // Le cas que la grille pourrait casser : deux marqueurs très proches mais de
  // part et d'autre d'une frontière de cellule. Ils DOIVENT fusionner — d'où
  // l'examen des 9 cellules voisines et non de la seule cellule du marqueur.
  it('fusionne deux marqueurs proches séparés par une frontière de cellule', () => {
    const radius = 2
    // Pas de la grille en latitude ≈ radius / 111.19. On place deux marqueurs
    // à 100 m de part et d'autre d'un multiple exact de ce pas.
    const step = radius / 111.19
    const boundary = Math.ceil(48 / step) * step
    const delta = 0.05 / 111.19 // ~50 m
    const view = buildStationClusters(
      [marker('gauche', boundary - delta, 2.35), marker('droite', boundary + delta, 2.35)],
      radius
    )
    expect(view.clusters).toHaveLength(1)
    expect(view.clusters[0]!.markerIds.sort()).toEqual(['droite', 'gauche'])
  })

  // Garde de charge : l'échelle réelle (9 500 stations Gazole en base). La
  // borne est large — l'implémentation en grille tourne ~2 ordres de grandeur
  // sous les 4 344 ms mesurés avant le ticket 036 — pour ne pas être instable
  // en CI tout en attrapant un retour à un algorithme quadratique.
  it('tient l’échelle de la France : 9 500 marqueurs sous 500 ms à chaque zoom', () => {
    const markers = spreadMarkers(9500)
    for (const zoom of [6, 8, 10, 12]) {
      const radius = clusterRadiusKmForZoom(zoom)
      const started = performance.now()
      buildStationClusters(markers, radius)
      const elapsed = performance.now() - started
      expect(elapsed, `zoom ${zoom} (rayon ${radius} km) : ${elapsed.toFixed(0)} ms`).toBeLessThan(
        500
      )
    }
  }, 60_000)
})

// Régression ciblée sur la cause de la divergence corrigée pendant le 036 :
// un degré de longitude vaut 111,19 × cos(lat) km, donc une cellule d'un pas
// FIXE en degrés se rétrécit en km vers le nord. Si elle descend sous R, un
// cluster à moins de R km tombe à deux cellules et échappe à la fenêtre 3×3.
// Ce test échoue si l'on revient à un cos fixe pris au centre de la France.
describe('largeur de cellule et latitude (ticket 036)', () => {
  it('fusionne deux marqueurs proches tout au nord du territoire', () => {
    const radius = 10
    // Dunkerque (51,03° N) : cos(51°) ≈ 0,629 contre 0,688 à 46,5° — une
    // cellule dimensionnée sur 46,5° y serait ~9 % trop étroite.
    const lat = 51.03
    // Deux marqueurs écartés de ~9 km en longitude : sous le rayon de 10 km,
    // donc ils DOIVENT fusionner quel que soit le découpage de la grille.
    const kmPerDegLon = 111.19 * Math.cos((lat * Math.PI) / 180)
    const a = marker('nord-a', lat, 2.37)
    const b = marker('nord-b', lat, 2.37 + 9 / kmPerDegLon)
    expect(haversineKm({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon })).toBeLessThan(radius)

    const view = buildStationClusters([a, b], radius)
    expect(view.clusters).toHaveLength(1)
    expect(view.clusters[0]!.markerIds.sort()).toEqual(['nord-a', 'nord-b'])
  })

  it('reste exact sur un jeu étalé du sud au nord du territoire', () => {
    const markers: StationMapMarker[] = []
    for (let i = 0; i < 500; i++) {
      // Une colonne dense de 41° à 51,5° : toutes les largeurs de cellule.
      markers.push(marker(`col${i}`, 41 + (i * 10.5) / 500, 2.35 + (i % 7) * 0.02))
    }
    const view = buildStationClusters(markers, 12)
    const expected = naiveClusters(markers, 12)
    expect(view.clusters).toHaveLength(expected.length)
  })
})
