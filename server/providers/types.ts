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

// ——— Métadonnées d'identité (ticket 018, provider OSM) ———
// Le flux officiel ne publie ni nom réel ni enseigne ni logo ; OSM les fournit
// via `ref:FR:prix-carburants` (= id officiel, matching 1:1). Uniquement de
// l'IDENTITÉ : aucun prix ici (019 applique ces métadonnées aux StationPrice).

// Licence de la source de métadonnées (attribution exigée — affichage UI 021).
export const OSM_METADATA_SOURCE_NAME = 'OpenStreetMap (ODbL)'

// Résultat du provider de métadonnées : les champs d'identité résolus, par id
// DGCCRF. Chaque champ est nullable : la résolution est best-effort.
export interface StationMetadata {
  id: string
  name: string | null
  brand: string | null
  brandWikidataId: string | null
  logoUrl: string | null
}

// Abstraction d'un fournisseur de métadonnées d'identité (même philosophie
// qu'un FuelPriceProvider — ADR-0003) : tolérance aux pannes (retour vide
// plutôt qu'une erreur), matching 1:1 par id DGCCRF.
export interface StationMetadataProvider {
  readonly name: string
  // Source réelle (nom/licence) pour l'attribution affichée à l'utilisateur.
  readonly sourceName: string
  findMetadataFor(stationIds: string[]): Promise<StationMetadata[]>
}
