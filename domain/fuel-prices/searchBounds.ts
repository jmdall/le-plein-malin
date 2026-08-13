// domain/fuel-prices/searchBounds.ts — Bornes géographiques du territoire
// couvert, partagées app + server (ticket 033/034, revue CI).
//
// L'API borne lat/lon à la France métropolitaine (spec §14 #14 : coordonnées
// hors France → rejetées) et répond 400 en dehors. Le client doit connaître
// exactement les mêmes bornes : sinon il envoie des coordonnées valides mais
// refusées, et une recherche qui passait par le texte (géocodée côté serveur)
// se met à échouer. Une seule définition, deux consommateurs :
//   - server/lib/validation.ts (schémas Zod latSchema / lonSchema) ;
//   - app/utils/location.ts (resolveSearchInput : hors bornes ⇒ repli texte).
//
// Ce module vit dans `domain/` et non dans `shared/` : Nuxt applique au dossier
// `shared/` une transformation d'imports qui casse le bundle Vite/Rollup quand
// un fichier de `app/` l'importe en relatif (RollupError « Could not resolve
// ../../../../../shared/geo.ts »). `domain/` est déjà importé des deux côtés
// (voir app/utils/stationClusters.ts → domain/fuel-prices/haversine).
//
// Module 100 % pur : aucune dépendance Nuxt/HTTP/SQLite/env (AGENTS.md).
import type { GeoPoint } from './types'

export const FRANCE_BOUNDS = {
  minLat: 41,
  maxLat: 51.5,
  minLon: -5.5,
  maxLon: 9.8
} as const

// Vrai si la position est utilisable comme centre de recherche par l'API.
// Une valeur non finie (NaN, Infinity) est rejetée explicitement : les
// comparaisons la rejetteraient déjà, mais l'intention doit se lire.
export function isSearchablePosition(position: GeoPoint | null | undefined): position is GeoPoint {
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
