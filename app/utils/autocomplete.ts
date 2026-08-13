// utils/autocomplete.ts — Suggestions de recherche ville/adresse (ticket 025).
// Module PUR : aucune dépendance Nuxt/HTTP/localStorage — le fetch et le
// débounce vivent dans LocationSearch.vue. On normalise ici la réponse
// GeoJSON de https://api-adresse.data.gouv.fr/search (API de l'État, gratuite,
// sans clé — docs/research/pouvoirachatplus-carte.md §5-6).
//
// LOC-4 : seul le texte saisi part vers le BAN, jamais la position de
// l'utilisateur. Depuis le ticket 031 on conserve en revanche le centroïde que
// le BAN renvoie POUR LA SUGGESTION — c'est un lieu public choisi dans une
// liste, pas la position de l'utilisateur, et il n'est jamais persisté.
//
// Repli : si une suggestion ne porte rien d'utilisable, la recherche tombe sur
// la valeur brute saisie par l'utilisateur — on n'invente jamais de donnée.
import type { GeoPosition } from './location'

// Base de l'API publique de géocodage de l'État (Etalab, data.gouv.fr).
export const AUTOCOMPLETE_BASE_URL = 'https://api-adresse.data.gouv.fr/search'

// Nombre de suggestions demandées : limit 6 (docs/research/… §5-6, ticket 025).
export const AUTOCOMPLETE_LIMIT = 6

// Une suggestion normalisée, prête à afficher. Seuls les champs utiles sont
// conservés ; label est toujours présent (repli ville).
//
// Ticket 031 : la suggestion porte AUSSI son centroïde. Le BAN le fournit déjà
// dans `geometry.coordinates` ; le jeter obligeait le serveur à géocoder une
// deuxième fois le même lieu, avec un autre fournisseur (Nominatim) et donc un
// autre centre — la station de référence n'était plus celle du point choisi.
// `position` est `null` quand la géométrie manque ou est invalide : on ne
// devine jamais une position (invariant « aucune donnée inventée »).
export interface AutocompleteSuggestion {
  label: string
  city: string
  postalCode: string
  context: string
  position: GeoPosition | null
}

// Ce qu'une sélection (ou un submit texte libre) transmet à la page : le texte
// robuste pour le géocodage serveur, et le centre exact quand il est connu.
export interface LocationSelection {
  query: string
  position: GeoPosition | null
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
  geometry?: {
    coordinates?: unknown
  }
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// ——— Centroïde de la suggestion (ticket 031) ———
// GeoJSON ordonne les coordonnées [longitude, latitude] — l'inverse de la
// convention lat/lon utilisée partout ailleurs dans l'app. On rejette tout ce
// qui n'est pas un couple de nombres finis dans les bornes terrestres : une
// valeur douteuse doit donner `null` (le serveur géocodera le texte) plutôt
// qu'un centre faux, qui décalerait silencieusement la station de référence.
//
// Cette fonction ne juge QUE la validité de la coordonnée. Savoir si l'API
// accepte ce point comme centre de recherche est une autre question, tranchée
// par `resolveSearchInput` (app/utils/location.ts) avec les bornes France.
function parseSuggestionPosition(geometry: unknown): GeoPosition | null {
  if (typeof geometry !== 'object' || geometry === null) return null
  const coordinates = (geometry as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null

  const [lon, lat] = coordinates
  if (typeof lon !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

  return { lat, lon }
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
    context: cleanString(properties.context),
    position: parseSuggestionPosition((feature as AdresseFeature).geometry)
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
// Chaîne la plus robuste pour le géocodage serveur (server/lib/geocode.ts) :
// « ville CP » quand la ville est connue, sinon le label complet. Repli : la
// valeur saisie brute. Ce texte reste nécessaire même quand la position est
// connue : il porte le libellé affiché et la mémorisation locale (LOC-2).
export function buildSearchQuery(suggestion: AutocompleteSuggestion | null, input: string): string {
  if (!suggestion) return input
  const city = suggestion.city.trim()
  const postalCode = suggestion.postalCode.trim()
  if (city !== '' && postalCode !== '') return `${city} ${postalCode}`
  if (city !== '') return city
  const label = suggestion.label.trim()
  return label !== '' ? label : input
}

// ——— Sélection complète (ticket 031) ———
// Ce que la page reçoit sur @search : le texte ci-dessus, et le centre choisi
// quand la suggestion le porte. Avec une position, la page envoie lat/lon à
// l'API et le géocodage serveur ne s'exécute pas du tout.
export function buildLocationSelection(
  suggestion: AutocompleteSuggestion | null,
  input: string
): LocationSelection {
  return {
    query: buildSearchQuery(suggestion, input),
    position: suggestion?.position ?? null
  }
}
