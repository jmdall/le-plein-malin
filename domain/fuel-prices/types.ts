// domain/fuel-prices/types.ts
export const FUEL_TYPES = ['Gazole', 'SP95', 'SP98', 'E10', 'E85', 'GPLc'] as const

export type FuelType = (typeof FUEL_TYPES)[number]

export interface GeoPoint {
  lat: number
  lon: number
}

export interface StationPrice {
  id: string
  name: string
  brand: string | null // « si disponible » — souvent null
  address: string
  city: string
  postalCode: string
  position: GeoPoint
  fuel: FuelType
  price: number // €/L, normalisé en nombre
  updatedAt: Date // prix_maj — jamais inventé
  // Enrichissement 016-019 : nullable, seulement présents quand la source
  // (OSM / dérivation adresse) les a réellement fournis — jamais inventés.
  brandWikidataId?: string | null
  logoUrl?: string | null
}

export interface FreshnessInfo {
  ageInHours: number
  status: 'fresh' | 'stale' | 'obsolete' // ≤24h / 24–48h / >48h
  score: number // 0..1
}
