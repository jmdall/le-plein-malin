// server/providers/types.ts — Abstraction FuelPriceProvider (ADR-0003, spec §10).
// Le domaine (domain/fuel-prices) ne voit jamais le format gouvernemental
// (JSON Opendatasoft / XML roulez-eco) : chaque provider produit des
// StationPrice[] normalisés. Aucune règle métier ici.
import type { FuelType, StationPrice } from '../../domain/fuel-prices/types'

// Rayons de recherche autorisés côté API (cahier des charges §6, spec §5.1-LOC-3).
// La contrainte 5/10/20/30 km est celle de l'API (validée en Zod) ; l'abstraction
// provider accepte n'importe quel rayon (le job de synchronisation utilise un
// « rayon large France », ticket 008).
export const PROVIDER_RADII_KM = [5, 10, 20, 30] as const
export type ProviderRadiusKm = (typeof PROVIDER_RADII_KM)[number]

// Requête de proximité : soit un centre géographique (lat/lon), soit une
// ville / un code postal géocodé côté serveur (spec §4 parcours sans
// géolocalisation). Le rayon est toujours exprimé en km.
export interface NearbyStationQuery {
  center: { lat: number; lon: number }
  radiusKm: number
  fuel: FuelType
}

// D'où viennent les données, pour l'affichage (« données en cache (date) »).
export type ProviderSource =
  | 'opendatasoft-api'
  | 'opendatasoft-export'
  | 'roulez-eco'
  | 'cache'

// Résultat d'un provider : les stations normalisées + la source réelle +
// la date de synchronisation de la source (le `prix_maj` des prix est le
// plus ancien/le plus récent ? on retient le synced_at de la source).
export interface ProviderResult {
  stations: StationPrice[]
  source: ProviderSource
  syncedAt: Date
}

// Erreur d'un provider : le message est toujours explicite (jamais inventé).
export interface ProviderError {
  message: string
}

// Abstraction cible (cahier des charges §10, ADR-0003). Chaque implémentation
// retourne des données normalisées et exclus, ou lève une ProviderError.
export interface FuelPriceProvider {
  readonly name: string
  findNearbyStations(query: NearbyStationQuery): Promise<ProviderResult>
}
