// utils/stationMap.ts — Présentation de la carte (ticket 012, spec §4 step 4,
// §2.1 carte OpenStreetMap). Module client pur : aucune dépendance Leaflet ici.
// Il décide simplement :
//   - le centre de la carte (query.center de l'API, sinon le centroïde des
//     stations, sinon null) et le zoom initial ;
//   - la liste des marqueurs (une entrée par station, avec la station de
//     référence repérée pour le style non-hiérarchique NFR-ACC-4) ;
//   - les éléments de la popup : nom, prix, distance, fraîcheur (libellé texte
//     porteur d'information, NFR-ACC-4), lien d'itinéraire OSM (spec §4 #7).
// Leaflet est chargé dynamiquement côté client dans components/StationMap.vue.
import { buildDirectionsUrl } from './location'
import { FRESHNESS_LABELS } from './stations'
import { formatPrice, formatDistance, formatAgeLabel } from './format'
import type { ListedStation } from './stations'

export const MAP_START_ZOOM = 11

export interface StationMapMarker {
  id: string
  name: string
  lat: number
  lon: number
  isReference: boolean
  priceLabel: string
  distanceLabel: string
  freshnessLabel: string
  ageLabel: string
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

export function buildStationMapView(
  stations: ListedStation[],
  referenceStation: ListedStation | null,
  center: { lat: number; lon: number } | null | undefined
): StationMapView {
  const markers: StationMapMarker[] = stations.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.position.lat,
    lon: s.position.lon,
    isReference: s.isReference,
    priceLabel: formatPrice(s.price),
    distanceLabel: formatDistance(s.distanceKm),
    freshnessLabel: FRESHNESS_LABELS[s.freshness.status],
    ageLabel: formatAgeLabel(s.freshness.ageInHours),
    directionsUrl: buildDirectionsUrl(s.position)
  }))

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
    ? `<span class="map-popup-freshness">${marker.freshnessLabel} — ${marker.ageLabel}</span>`
    : `<span class="map-popup-freshness">${marker.freshnessLabel}</span>`
  return (
    `<div class="map-popup">` +
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
