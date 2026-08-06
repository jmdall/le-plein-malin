// utils/autocomplete.ts — Suggestions de recherche ville/adresse (ticket 025).
// Module PUR : aucune dépendance Nuxt/HTTP/localStorage — le fetch et le
// débounce vivent dans LocationSearch.vue. On normalise ici la réponse
// GeoJSON de https://api-adresse.data.gouv.fr/search (API de l'État, gratuite,
// sans clé — docs/research/pouvoirachatplus-carte.md §5-6). Seul le texte saisi
// est transmis, jamais de position précise (LOC-4).
//
// Repli : si une suggestion ne porte rien d'utilisable, la recherche tombe sur
// la valeur brute saisie par l'utilisateur — on n'invente jamais de donnée.

// Base de l'API publique de géocodage de l'État (Etalab, data.gouv.fr).
export const AUTOCOMPLETE_BASE_URL = 'https://api-adresse.data.gouv.fr/search'

// Nombre de suggestions demandées : limit 6 (docs/research/… §5-6, ticket 025).
export const AUTOCOMPLETE_LIMIT = 6

// Une suggestion normalisée, prête à afficher. Seuls les champs utiles sont
// conservés ; label est toujours présent (repli ville) ; jamais de coordonnées.
export interface AutocompleteSuggestion {
  label: string
  city: string
  postalCode: string
  context: string
}

// ——— URL de recherche ———
// « ?q=<texte>&limit=6 » : uniquement le texte saisi, jamais lat/lon (LOC-4).
export function buildAutocompleteUrl(query: string, limit: number = AUTOCOMPLETE_LIMIT): string {
  const url = new URL(AUTOCOMPLETE_BASE_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))
  return url.toString()
}

// ——— Parsing de la réponse GeoJSON ———
// L'API renvoie une FeatureCollection dont chaque feature a :
//   properties: { label, type, name, postcode, city, context, … }
// On garde label / city / postcode / context. Le label n'est pas toujours
// présent (on replit sur la ville) et les champs inattendus sont ignorés.
interface AdresseFeature {
  properties?: {
    label?: unknown
    city?: unknown
    postcode?: unknown
    context?: unknown
  }
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseFeature(feature: unknown): AutocompleteSuggestion | null {
  if (typeof feature !== 'object' || feature === null) return null
  const properties = (feature as AdresseFeature).properties
  if (!properties || typeof properties !== 'object') return null

  const city = cleanString(properties.city)
  const label = cleanString(properties.label) || city
  if (label === '') return null

  return {
    label,
    city,
    postalCode: cleanString(properties.postcode),
    context: cleanString(properties.context)
  }
}

export function parseAutocompleteResponse(json: unknown, _input: string): AutocompleteSuggestion[] {
  if (typeof json !== 'object' || json === null) return []
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features)) return []

  const suggestions: AutocompleteSuggestion[] = []
  for (const feature of features) {
    const parsed = parseFeature(feature)
    if (parsed) suggestions.push(parsed)
  }
  return suggestions
}

// ——— Requête de recherche à envoyer à la page ———
// La sélection d'une suggestion déclenche la recherche existante (@search).
// On construit la chaîne la plus robuste pour le géocodage serveur
// (server/lib/geocode.ts, Nominatim + repli api-adresse) : « ville CP » quand
// la ville est connue, sinon le label complet. Repli : la valeur saisie brute.
export function buildSearchQuery(suggestion: AutocompleteSuggestion | null, input: string): string {
  if (!suggestion) return input
  const city = suggestion.city.trim()
  const postalCode = suggestion.postalCode.trim()
  if (city !== '' && postalCode !== '') return `${city} ${postalCode}`
  if (city !== '') return city
  const label = suggestion.label.trim()
  return label !== '' ? label : input
}
