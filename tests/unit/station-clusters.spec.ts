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

function marker(id: string, lat: number, lon: number): StationMapMarker {
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
    directionsUrl: 'https://www.openstreetmap.org/directions?from=&to='
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
