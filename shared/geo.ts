// shared/geo.ts — Bornes géographiques partagées app + server (ticket 031).
//
// L'API borne lat/lon à la France métropolitaine (spec §14 #14 : coordonnées
// hors France → rejetées) et répond 400 en dehors. Le client doit connaître
// exactement les mêmes bornes : sinon il envoie des coordonnées valides mais
// refusées, et une recherche qui passait par le texte (géocodé côté serveur)
// se met à échouer. Une seule définition, deux consommateurs :
//   - server/lib/validation.ts (schémas Zod latSchema / lonSchema) ;
//   - app/utils/location.ts (resolveSearchInput : hors bornes ⇒ repli texte).
//
// Aucune règle métier ici : uniquement des bornes et un prédicat de forme.

export const FRANCE_BOUNDS = {
  minLat: 41,
  maxLat: 51.5,
  minLon: -5.5,
  maxLon: 9.8
} as const

export interface LatLon {
  lat: number
  lon: number
}

// Vrai si la position est utilisable comme centre de recherche par l'API.
// Une valeur non finie (NaN, Infinity) est rejetée explicitement : les
// comparaisons la rejetteraient déjà, mais l'intention doit se lire.
export function isSearchablePosition(position: LatLon | null | undefined): position is LatLon {
  if (!position) return false
  const { lat, lon } = position
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  return (
    lat >= FRANCE_BOUNDS.minLat &&
    lat <= FRANCE_BOUNDS.maxLat &&
    lon >= FRANCE_BOUNDS.minLon &&
    lon <= FRANCE_BOUNDS.maxLon
  )
}
