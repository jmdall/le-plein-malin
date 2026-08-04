// domain/stations/deriveBrand.ts — Dérivation d'enseigne par libellé d'adresse
// (ticket 017, spec §2.2 hors périmètre, réintégré comme repli du mode hybride
// 017+018). Module pur (aucune dépendance Nuxt/HTTP/SQLite/env) : il reconnaît
// une enseigne réelle dans le libellé d'adresse (la ville en contexte
// optionnel) et ne fabrique jamais de nom — sans correspondance il retourne
// null et l'appelant garde le nom par défaut (id). La liste est finie, réelle
// et ordonnée : la marque la plus spécifique d'abord (TotalEnergies avant
// Total, Carrefour Market avant Carrefour, …) pour un résultat déterministe.
export interface DerivedIdentity {
  name: string
  /** L'enseigne dérivée EST le nom : à la correspondance, les deux sont
      identiques (jamais null — la dérivation d'adresse ne produit pas
      d'enseigne distincte d'un nom). L'appelant garde brand = null seulement
      en l'absence de correspondance (retour null). */
  brand: string
}

interface BrandEntry {
  /** Libellé de recherche normalisé (minuscules, sans accents). */
  search: string
  /** Nom d'affichage canonique, proprement capitalisé. */
  display: string
  /** Motif regex de remplacement sur le texte normalisé (cas particuliers). */
  pattern?: string
}

// Enseignes réelles de stations-service en France, de la plus spécifique à la
// plus générique : le premier match gagne. Aucune marque inventée.
const LETTERS = 'a-zàâäéèêëîïôöùûüç'
const BRANDS: BrandEntry[] = [
  { search: 'totalenergies', display: 'TotalEnergies' },
  { search: 'total access', display: 'Total Access' },
  { search: 'u express', display: 'U Express' },
  { search: 'super u', display: 'Super U' },
  { search: 'systeme u', display: 'Système U' },
  { search: 'intermarche', display: 'Intermarché' },
  { search: 'carrefour market', display: 'Carrefour Market' },
  { search: 'carrefour', display: 'Carrefour' },
  { search: 'auchan', display: 'Auchan' },
  { search: 'e.leclerc', display: 'E.Leclerc' },
  { search: 'leclerc', display: 'Leclerc' },
  { search: 'esso express', display: 'Esso Express' },
  { search: 'esso', display: 'Esso' },
  { search: 'geant casino', display: 'Géant Casino' },
  { search: 'casino', display: 'Casino' },
  // « BP 1234 » = Boîte Postale (usage postal courant) : pas une enseigne. On
  // exige donc que « BP » ne soit pas suivi d'un numéro pour être la marque.
  { search: 'bp', display: 'BP', pattern: `(?<![${LETTERS}])bp(?! *[0-9])(?![${LETTERS}])` },
  { search: 'shell', display: 'Shell' },
  { search: 'avia', display: 'Avia' },
  { search: 'eni', display: 'Eni' },
  { search: 'elan', display: 'Elan' },
  { search: 'total', display: 'Total' },
  { search: 'cora', display: 'Cora' }
]

// Mot entier uniquement : une enseigne ne matche pas en plein milieu d'un mot
// (« Casinots » ne produit pas « Casino »). Les séparateurs (– — / . , …) sont
// des bornes de mot comme les espaces.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type BrandPattern = Omit<BrandEntry, 'pattern'> & { pattern: RegExp }

// Borne « non-lettre » des deux côtés (l'espace, la ponctuation et le début/
// fin de chaîne en font partie) : « VBP » ou « BPX » ne matchent pas, « RUE
// BP » oui.
const BRAND_PATTERNS: BrandPattern[] = BRANDS.map((entry) => ({
  ...entry,
  pattern: new RegExp(
    entry.pattern ?? `(?<![${LETTERS}])${escapeRegExp(entry.search)}(?![${LETTERS}])`
  )
}))

// Minuscules + suppression des accents : « INTERMARCHE » ≡ « Intermarché ».
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function deriveBrandFromAddress(address: string, city: string): DerivedIdentity | null {
  const haystack = normalize(`${address} ${city}`).trim()
  if (haystack === '') return null

  for (const entry of BRAND_PATTERNS) {
    if (entry.pattern.test(haystack)) {
      return { name: entry.display, brand: entry.display }
    }
  }

  return null
}
