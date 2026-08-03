import type { GeoPoint } from './types'

const EARTH_RADIUS_KM = 6371
const TO_RADIANS = Math.PI / 180

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const latDelta = (b.lat - a.lat) * TO_RADIANS
  const lonDelta = (b.lon - a.lon) * TO_RADIANS
  const sinLat = Math.sin(latDelta / 2)
  const sinLon = Math.sin(lonDelta / 2)
  const h =
    sinLat * sinLat +
    Math.cos(a.lat * TO_RADIANS) * Math.cos(b.lat * TO_RADIANS) * sinLon * sinLon
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
