// utils/stationMap.ts — Présentation de la carte (ticket 012, spec §4 step 4,
// §2.1 carte OpenStreetMap ; écran carte plein viewport, docs/design/ui-reference.md).
// Module client pur : aucune dépendance Leaflet ici. Il décide simplement :
//   - le centre de la carte (query.center de l'API, sinon le centroïde des
//     stations, sinon null) et le zoom initial ;
//   - la liste des marqueurs (une entrée par station, avec la station de
//     référence et la station recommandée repérées pour le style
//     non-hiérarchique NFR-ACC-4) ;
//   - les marqueurs, leur style (référence / recommandée / périmée atténuée)
//     et la pastille enseigne + logo (ticket 021) — aucune règle de prix n'est
//     recalculée ici (REC-2/D1) ;
//   - les éléments de la popup : nom, prix, distance, fraîcheur (libellé texte
//     porteur d'information, NFR-ACC-4), lien d'itinéraire OSM (spec §4 #7).
// Leaflet est chargé dynamiquement côté client dans components/StationMap.vue.
import { buildDirectionsUrl } from './location'
import { FRESHNESS_LABELS } from './stations'
import { formatPrice, formatDistance, formatAgeLabel } from './format'
import { displayLogoFor, brandInitial } from './stationIdentity'
import type { ListedStation } from './stations'

export const MAP_START_ZOOM = 11

// ——— Style des marqueurs ———
// Aucune règle de prix n'est recalculée côté client (REC-2/D1) : la carte ne
// fait que présenter les champs fournis par l'API. Les marqueurs sont
// neutres ; un prix périmé (> 48 h, freshness.status === 'obsolete') est
// simplement atténué (isStale), sans couleur comparative inventée.
export interface StationMapMarker {
  id: string
  name: string
  brand: string | null
  /** URL de logo validée (https, wikimedia.org) — jamais une URL arbitraire
      (utils/stationIdentity.ts, ticket 021). Décorative : le nom réel prime. */
  logoUrl: string | null
  lat: number
  lon: number
  isReference: boolean
  isRecommended: boolean
  price: number
  priceLabel: string
  markerPriceLabel: string
  distanceLabel: string
  freshnessLabel: string
  ageLabel: string
  /** > 24 h (CONTEXT.md §Fraîcheur) : affichage atténué + marqueur de fraîcheur. */
  isStale: boolean
  /** Attractivité du prix vs référence, 0…1 (API) : dégradé du badge.
      La référence porte elle aussi la sienne (son prix égale la base →
      0,5). null seulement si aucune base de prix n'est disponible. */
  attractiveness: number | null
  directionsUrl: string
}

export interface StationMapCenter {
  lat: number
  lon: number
  zoom: number
}

export interface StationMapView {
  center: StationMapCenter | null
  markers: StationMapMarker[]
}

function centroid(stations: ListedStation[]): { lat: number; lon: number } | null {
  if (stations.length === 0) return null
  const total = stations.length
  const lat = stations.reduce((sum, s) => sum + s.position.lat, 0) / total
  const lon = stations.reduce((sum, s) => sum + s.position.lon, 0) / total
  return { lat, lon }
}

// ——— Prix compact pour le badge marqueur : virgule décimale, 3 décimales
// (docs/design/ui-reference.md §4, ex. « 2,319 »), sans l'unité « €/L » qui
// resterait illisible dans un badge de cette taille (elle reste dans la
// popup et la liste via formatPrice). ———
export function formatMarkerPrice(price: number): string {
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function buildStationMapView(
  stations: ListedStation[],
  referenceStation: ListedStation | null,
  center: { lat: number; lon: number } | null | undefined,
  recommendedStationId: string | null = null
): StationMapView {
  const markers: StationMapMarker[] = stations.map((s) => {
    return {
      id: s.id,
      name: s.name,
      brand: s.brand,
      logoUrl: displayLogoFor(s.brand, s.logoUrl),
      lat: s.position.lat,
      lon: s.position.lon,
      isReference: s.isReference,
      isRecommended: recommendedStationId !== null && s.id === recommendedStationId,
      price: s.price,
      priceLabel: formatPrice(s.price),
      markerPriceLabel: formatMarkerPrice(s.price),
      distanceLabel: formatDistance(s.distanceKm),
      freshnessLabel: FRESHNESS_LABELS[s.freshness.status],
      ageLabel: formatAgeLabel(s.freshness.ageInHours),
      isStale: s.freshness.ageInHours > 24,
      attractiveness: s.attractiveness ?? null,
      directionsUrl: buildDirectionsUrl(s.position)
    }
  })

  const effectiveCenter = center ?? referenceStation?.position ?? centroid(stations) ?? null
  if (!effectiveCenter) {
    return { center: null, markers }
  }

  return {
    center: { lat: effectiveCenter.lat, lon: effectiveCenter.lon, zoom: MAP_START_ZOOM },
    markers
  }
}

export function buildPopupHtml(marker: StationMapMarker): string {
  const freshPart = marker.ageLabel
    ? `<p class="map-popup-freshness">${marker.freshnessLabel} — ${marker.ageLabel}</p>`
    : `<p class="map-popup-freshness">${marker.freshnessLabel}</p>`
  const recoPart = marker.isRecommended
    ? `<p class="map-popup-reco pill pill-accent">★ Recommandée</p>`
    : ''
  // Enseigne + logo dans la popup (ticket 021). Le nom réel est toujours en
  // texte (NFR-ACC-4) ; le logo est décoratif (alt vide) avec repli neutre
  // `onerror` : jamais une image cassée. Sans logo, la pastille initiale
  // remplace élégamment l'image (jamais un carré vide).
  const brandGlyph = marker.logoUrl
    ? `<img class="map-popup-logo" src="${escapeHtml(marker.logoUrl)}" alt="" width="18" height="18" loading="lazy" onerror="this.remove()" />`
    : `<span class="map-popup-logo-fallback" aria-hidden="true">${escapeHtml(brandInitial(marker.brand ?? '') || '⛽')}</span>`
  const brandPart = marker.brand
    ? `<p class="map-popup-brand">${brandGlyph}${escapeHtml(marker.brand)}</p>`
    : ''
  return (
    `<div class="map-popup">` +
    recoPart +
    brandPart +
    `<p class="map-popup-title">${escapeHtml(marker.name)}</p>` +
    `<p class="map-popup-line"><span class="map-popup-price">${marker.priceLabel}</span> — ${marker.distanceLabel}</p>` +
    freshPart +
    `<a class="map-popup-directions" href="${escapeHtml(marker.directionsUrl)}" target="_blank" rel="noopener noreferrer">Itinéraire</a>` +
    `</div>`
  )
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
