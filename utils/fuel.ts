// utils/fuel.ts — Représentation côté client des carburants (ticket 010).
// Pure : aucune dépendance Nuxt/HTTP. Le libellé court et le label affiché
// servent aux contrôles du formulaire et à l'affichage de la recommandation.
// La source de vérité des valeurs reste domain/fuel-prices/types (FUEL_TYPES) ;
// ce module n'ajoute que le rendu.
export type FuelValue = 'SP95' | 'SP95-E10' | 'SP98' | 'E85' | 'Gazole' | 'GPLc'

export interface FuelOption {
  value: FuelValue
  label: string
}

export const FUEL_OPTIONS: FuelOption[] = [
  { value: 'SP95', label: 'SP95' },
  { value: 'SP95-E10', label: 'SP95-E10' },
  { value: 'SP98', label: 'SP98' },
  { value: 'E85', label: 'E85' },
  { value: 'Gazole', label: 'Gazole' },
  { value: 'GPLc', label: 'GPLc' }
]

export const DEFAULT_FUEL: FuelValue = 'Gazole'

export function isFuelValue(value: unknown): value is FuelValue {
  return FUEL_OPTIONS.some((f) => f.value === value)
}

export function fuelOptionFor(value: FuelValue): FuelOption {
  return FUEL_OPTIONS.find((f) => f.value === value) ?? { value, label: value }
}

// ——— Correspondance UI ↔ API (spec §5.2 CAR-1, table prix_nom) ———
export const UI_TO_API_FUEL: Record<FuelValue, string> = {
  SP95: 'SP95',
  'SP95-E10': 'E10',
  SP98: 'SP98',
  E85: 'E85',
  Gazole: 'Gazole',
  GPLc: 'GPLc'
}

export const API_TO_UI_FUEL: Record<string, FuelValue> = {
  SP95: 'SP95',
  E10: 'SP95-E10',
  SP98: 'SP98',
  E85: 'E85',
  Gazole: 'Gazole',
  GPLc: 'GPLc'
}

export function fuelToApi(value: FuelValue): string {
  return UI_TO_API_FUEL[value]
}

export function fuelFromApi(value: string | undefined): FuelValue {
  if (value !== undefined && API_TO_UI_FUEL[value] !== undefined) {
    return API_TO_UI_FUEL[value] as FuelValue
  }
  return DEFAULT_FUEL
}
