// server/lib/validation.ts — Schemas Zod de l'API REST (ticket 009, spec §8).
// Validation stricte de TOUTES les entrées (NFR-SEC-2) : rayon ∈ {5,10,20,30},
// fuel ∈ 6 carburants, coordonnées bornées, profil véhicule cohérent.
// Aucune règle métier ici : uniquement la forme des requêtes.
import { z } from 'zod'
import { FUEL_TYPES } from '../../domain/fuel-prices/types'
import { FRANCE_BOUNDS } from '../../domain/fuel-prices/searchBounds'

// ——— Helpers de message d'erreur (Zod v4 : options `{ error }`) ———
function numError(msg: string) {
  return { error: msg }
}

// Coordonnées bornées : territoire français métropolitain (CORINE) + marge
// (spec §14 #14 : coordonnées hors France → rejetées). Les bornes vivent dans
// domain/fuel-prices/searchBounds.ts : le client les applique aussi, pour ne
// jamais envoyer une coordonnée que cette validation refuserait (ticket 031).
const { minLat, maxLat, minLon, maxLon } = FRANCE_BOUNDS
const LAT_RANGE = `lat hors bornes (${minLat}..${maxLat})`
const LON_RANGE = `lon hors bornes (${minLon}..${maxLon})`

export const latSchema = z.coerce
  .number(numError('lat doit être un nombre'))
  .min(minLat, { error: LAT_RANGE })
  .max(maxLat, { error: LAT_RANGE })

export const lonSchema = z.coerce
  .number(numError('lon doit être un nombre'))
  .min(minLon, { error: LON_RANGE })
  .max(maxLon, { error: LON_RANGE })

// ——— Provenance des coordonnées (ticket 031) ———
// `device` : position de l'appareil (géolocalisation) — le détour est mesuré
// depuis là où l'utilisateur se trouve vraiment.
// `place`  : centroïde d'un lieu choisi dans l'autocomplete — le centre est
// exact, mais l'utilisateur n'y est pas forcément : la recommandation doit
// rester aussi prudente qu'une recherche ville/CP (hypothèse de détour
// affichée, §13 #16). Défaut `device` : les appels existants ne changent pas.
export const positionSourceSchema = z
  .enum(['device', 'place'], { error: 'positionSource doit être device ou place' })
  .optional()
  .default('device')

export const radiusSchema = z.coerce
  .number(numError('radius doit être un nombre'))
  .int({ error: 'radius doit être un entier' })
  .refine((r) => [5, 10, 20, 30].includes(r), {
    error: 'radius doit être un des rayons {5, 10, 20, 30}'
  })

export const fuelSchema = z.enum(FUEL_TYPES, {
  error: `fuel doit être un des carburants : ${FUEL_TYPES.join(', ')}`
})

// q : ville ou code postal. Le code postal (5 chiffres) est normalisé.
export const querySchema = z
  .string()
  .trim()
  .min(1, { error: 'q ne doit pas être vide' })
  .max(120, { error: 'q trop long' })

export const postalCodeSchema = z
  .string()
  .trim()
  .min(1, { error: 'postalCode ne doit pas être vide' })
  .max(10, { error: 'postalCode trop long' })
  .regex(/^\d{5}$/, { error: 'postalCode doit comporter 5 chiffres' })

export const citySchema = z
  .string()
  .trim()
  .min(1, { error: 'city ne doit pas être vide' })
  .max(120, { error: 'city trop long' })

// Identifiant de station : texte court (les ids sources sont numériques, mais
// on n'impose pas — les ids roulez-eco/export peuvent différer).
export const stationIdSchema = z
  .string()
  .trim()
  .min(1, { error: 'id de station invalide' })
  .max(64, { error: 'id de station trop long' })

// ——— Profil véhicule — spec §5.4 (VEH-1, VEH-2) ———
// Consommation > 0, capacité > 0, 0 ≤ niveau ≤ capacité, quantité ≥ 0,
// seuil ≥ 0. Le contrôle croisé niveau ≤ capacité est fait en superRefine
// (dépend de tankCapacity, après coerce).
export const vehicleProfileSchema = z
  .object(
    {
      consumption: z.coerce
        .number(numError('consumption doit être un nombre'))
        .positive({ error: 'consumption doit être strictement positive' })
        .max(50, { error: 'consumption invraisemblable (> 50 L/100 km)' }),
      tankCapacity: z.coerce
        .number(numError('tankCapacity doit être un nombre'))
        .positive({ error: 'tankCapacity doit être strictement positive' })
        .max(1000, { error: 'tankCapacity invraisemblable (> 1000 L)' }),
      currentLevel: z.coerce
        .number(numError('currentLevel doit être un nombre'))
        .min(0, { error: 'currentLevel doit être ≥ 0' }),
      fuel: fuelSchema,
      preferredQuantity: z.preprocess(
        // Chaîne vide (formulaire non rempli) → absent (null), pas 0.
        (v) => (v === '' ? undefined : v),
        z.coerce
          .number(numError('preferredQuantity doit être un nombre'))
          .min(0, { error: 'preferredQuantity doit être ≥ 0' })
          .max(2000, { error: 'preferredQuantity invraisemblable (> 2000 L)' })
          .nullish()
          .transform((v) => v ?? null)
      ),
      savingsThreshold: z.coerce
        .number(numError('savingsThreshold doit être un nombre'))
        .min(0, { error: 'savingsThreshold doit être ≥ 0' })
        .max(100, { error: 'savingsThreshold invraisemblable (> 100 €)' })
        .default(1)
    },
    { error: (issue) => ({ message: issue.message ?? 'Entrée invalide' }) }
  )
  .superRefine((profile, ctx) => {
    if (profile.currentLevel > profile.tankCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentLevel'],
        message: 'currentLevel doit être ≤ tankCapacity'
      })
    }
  })

// Type du profil validé (objet avec fuel + nombres, preferredQuantity nullable).
export type ValidVehicleProfile = {
  fuel: (typeof FUEL_TYPES)[number]
  consumption: number
  tankCapacity: number
  currentLevel: number
  preferredQuantity: number | null
  savingsThreshold: number
}

// ——— Query commune /api/stations et /api/recommendation ———
// Soit un centre géographique (lat/lon), soit une recherche ville/CP
// (city | postalCode | q). Rayon optionnel (défaut 10 km), fuel optionnel
// (défaut Gazole).
export const baseLocationSchema = z
  .object(
    {
      lat: latSchema.optional(),
      lon: lonSchema.optional(),
      positionSource: positionSourceSchema,
      radius: radiusSchema.optional().default(10),
      fuel: fuelSchema.optional().default('Gazole'),
      q: querySchema.optional(),
      city: citySchema.optional(),
      postalCode: postalCodeSchema.optional()
    },
    { error: (issue) => ({ message: issue.message ?? 'Entrée invalide' }) }
  )
  .superRefine((value, ctx) => {
    const hasLatLon = value.lat !== undefined && value.lon !== undefined
    const hasQuery = value.q !== undefined || value.city !== undefined || value.postalCode !== undefined

    if (hasLatLon && hasQuery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lat'],
        message: 'fournir soit lat/lon soit une ville/code postal, pas les deux'
      })
      return
    }
    if (hasLatLon) {
      if (value.lat === undefined || value.lon === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lat'],
          message: 'lat et lon doivent être fournis ensemble'
        })
      }
      return
    }
    if (!hasQuery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lat'],
        message: 'fournir lat/lon, ou une ville (city), un code postal (postalCode) ou une recherche (q)'
      })
    }
    if (value.q !== undefined && (value.city !== undefined || value.postalCode !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q'],
        message: 'q est exclusif de city et postalCode'
      })
    }
  })

export type StationsQuery = z.infer<typeof baseLocationSchema>

// Vue « carte » : le centre résolu, et comment on l'a obtenu.
//   geo   : position de l'appareil (géolocalisation) — seul mode qui vaut une
//           géolocalisation pour la recommandation (hasGeoLocation).
//   place : lieu choisi dans l'autocomplete, centre exact mais pas la position
//           de l'utilisateur (ticket 031).
//   query : centroïde géocodé côté serveur depuis une ville / un code postal.
export type ResolvedCenter =
  | { mode: 'geo'; lat: number; lon: number }
  | { mode: 'place'; lat: number; lon: number }
  | { mode: 'query'; label: string; lat: number; lon: number }

// ——— Query /api/stations/:id/history (fuel optionnel) ———
export const historyQuerySchema = z.object(
  {
    fuel: fuelSchema.optional().default('Gazole')
  },
  { error: (issue) => ({ message: issue.message ?? 'Entrée invalide' }) }
)

// ——— Query /api/recommendation : mêmes params + vehicleProfile ———
export const recommendationQuerySchema = baseLocationSchema.extend({
  vehicleProfile: vehicleProfileSchema.optional()
})

export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>
