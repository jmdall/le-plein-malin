// server/providers/normalize.ts — Normalisation des enregistrements bruts
// (Opendatasoft JSON / export complet / XML roulez-eco) vers StationPrice[].
// Les exclusions (CAR-3) sont appliquées ici : station sans prix pour le
// carburant, en rupture (`rupture` non nul pour ce carburant), ou fermée
// (`fermeture` non nul). Aucun prix n'est inventé : un record non normalisable
// est exclu, jamais forgé.
import type { FuelType, GeoPoint, StationPrice } from '../../domain/fuel-prices/types'

// Correspondance officielle prix_nom → FuelType (recherche §3, spec §5.2-CAR-1).
const FUEL_MAP: Record<string, FuelType> = {
  Gazole: 'Gazole',
  SP95: 'SP95',
  SP98: 'SP98',
  'SP95-E10': 'E10',
  E10: 'E10',
  E85: 'E85',
  GPLc: 'GPLc'
}

// Intervalle documenté des prix (€/L) — hors GPLc/E85, voir spec §13 #15.
// Un prix hors intervalle est exclu (donnée aberrante), jamais inventé.
const PRICE_MIN = 0.5
const PRICE_MAX = 3.5

export function mapFuelName(name: string): FuelType | undefined {
  return FUEL_MAP[name]
}

export function isPlausiblePrice(price: number, fuel: FuelType): boolean {
  // GPLc et E85 ont des prix nettement plus bas : intervalle élargi pour eux.
  if (fuel === 'GPLc' || fuel === 'E85') {
    return price >= 0.1 && price <= 3.5
  }
  return price >= PRICE_MIN && price <= PRICE_MAX
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    // Les prix CSV peuvent être au format « 2,185 » (virgule française).
    const normalized = trimmed.replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function toDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d
}

// JSON de rupture/fermeture (Opendatasoft stocke le JSON en chaîne), ou null.
export function parseMetaJson(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return value as Record<string, string>
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, string>
    } catch {
      return null
    }
  }
  return null
}

export interface NormalizedRecord {
  id: string
  address: string
  city: string
  postalCode: string
  position: GeoPoint | null
  fuel: FuelType
  price: number
  updatedAt: Date
  rupture: boolean // rupture pour CE carburant
  closed: boolean // fermeture non nulle
}

export interface RecordSource {
  id: unknown
  address?: unknown
  // Opendatasoft API : « ville » ; le type « city » est accepté en secours.
  city?: unknown
  ville?: unknown
  cp?: unknown
  geom?: { lon?: unknown; lat?: unknown } | null
  // Opendatasoft : position E6 entière, et/ou geom.
  longitude?: unknown
  latitude?: unknown
  prix_nom?: unknown
  prix_valeur?: unknown
  prix_maj?: unknown
  rupture?: unknown
  fermeture?: unknown
}

// Extrait les ruptures listées dans `rupture` (JSON avec @nom) : ce sont des
// carburants en rupture à la station (≠ le carburant du record, voir
// vérification réelle). Renvoie true si le carburant `fuel` y figure.
function isFuelInRupture(rupture: unknown, fuel: FuelType): boolean {
  const meta = parseMetaJson(rupture)
  if (!meta) return false
  const ruptureNom = meta['@nom']
  if (!ruptureNom) return false
  return mapFuelName(ruptureNom) === fuel
}

// Normalise un record vers le domaine. Renvoie null si le record doit être
// exclu (pas de prix, geom manquante, rupture/fermeture pour ce carburant,
// prix aberrant, champ non normalisable).
export function normalizeRecord(raw: RecordSource, queryFuel: FuelType): StationPrice | null {
  const id = raw.id
  if (typeof id !== 'string' && typeof id !== 'number') return null
  const stationId = String(id)

  const address = typeof raw.address === 'string' ? raw.address : ''
  const cityValue = typeof raw.ville === 'string' ? raw.ville : raw.city
  const city = typeof cityValue === 'string' ? cityValue : ''
  const postalCode = typeof raw.cp === 'string' ? raw.cp : ''

  const rawFuelName = raw.prix_nom
  if (typeof rawFuelName !== 'string') return null
  const fuel = mapFuelName(rawFuelName)
  if (fuel === undefined) return null

  // Ne normalise que le carburant demandé : les autres records (autre
  // carburant à la même station) ne font pas partie du résultat.
  if (fuel !== queryFuel) return null

  const price = toNumber(raw.prix_valeur)
  if (price === undefined || !isPlausiblePrice(price, fuel)) return null

  const updatedAt = toDate(raw.prix_maj)
  if (!updatedAt) return null

  const closed = parseMetaJson(raw.fermeture) !== null
  if (closed) return null

  if (isFuelInRupture(raw.rupture, fuel)) return null

  const position = extractPosition(raw)
  if (!position) return null

  return {
    id: stationId,
    name: stationId,
    brand: null,
    address,
    city,
    postalCode,
    position,
    fuel,
    price,
    updatedAt
  }
}

// Position : `geom` {lon,lat} (API), ou `longitude`/`latitude` E6 entières
// (1/10 000 000 de degré, fichiers roulez-eco / exports). Jamais inventée.
function extractPosition(raw: RecordSource): GeoPoint | null {
  const geom = raw.geom
  if (geom && typeof geom.lon === 'number' && typeof geom.lat === 'number') {
    return { lon: geom.lon, lat: geom.lat }
  }

  const lonE6 = raw.longitude
  const latE6 = raw.latitude
  if (typeof lonE6 === 'number' && typeof latE6 === 'number' && lonE6 !== 0 && latE6 !== 0) {
    return { lon: lonE6 / 1e6, lat: latE6 / 1e6 }
  }

  return null
}
