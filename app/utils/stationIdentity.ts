// utils/stationIdentity.ts — Présentation de l'IDENTITÉ d'une station (ticket
// 021) : le nom réel, l'enseigne et le logo fournis par l'API (019/020), sans
// rien recalculer (REC-2/D1). Module client pur.
//
// Règles de cette UI :
//   - le logo n'est JAMAIS un vecteur d'information unique (NFR-ACC-4) : le
//     nom réel reste toujours présent en texte, l'image est décorative
//     (`alt=""` sur l'<img>) ou porte un alt descriptif quand elle doublonne
//     le texte déjà affiché ;
//   - aucune image cassée : une URL invalide (pas https, pas wikimedia) est
//     rejetée avant tout <img>, et `onerror` bascule proprement sur le repli ;
//   - repli élégant sans logo : pastille avec l'initiale de l'enseigne
//     (ou ⛽ si ni enseigne ni logo) — jamais un carré vide ni un id.
export interface StationIdentityBadge {
  /** Nom court de l'enseigne, repli sur le nom réel. Jamais l'id. */
  label: string
  /** URL de logo validée (https, wikimedia.org), sinon null. */
  logoUrl: string | null
  /** Initiale (1 caractère) pour la pastille de repli. */
  initial: string
  /** ⛽ quand aucun enseigne/logo, initiale sinon. */
  fallbackGlyph: string
  /** Description accessible : l'image étant décorative, la marque est déjà
      portée par le texte de la station ; cet alt sert seulement à nommer
      l'enseigne quand l'image la montre. */
  alt: string
}

// Blocage par domaine : les logos de marque arrivent de Wikimedia Commons
// (upload.wikimedia.org, construit de façon déterministe par le provider 018).
// Aucun autre hôte n'est accepté — une URL inconnue ne déclenche jamais de
// requête réseau (NFR-SEC). Un en-tête CSP/img-src du domaine wikimedia.org
// suffirait à durcir, mais ce garde-fou logiciel est le minimum.
const WIKIMEDIA_HOST = 'upload.wikimedia.org'

export function isSafeLogoUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === WIKIMEDIA_HOST
  } catch {
    return false
  }
}

/** Première lettre significative de l'enseigne (1 seule, en majuscule). */
export function brandInitial(brand: string): string {
  const trimmed = brand.trim()
  if (trimmed === '') return ''
  return Array.from(trimmed)[0]!.toUpperCase()
}

// ——— Logos par défaut d'enseigne ———
// Le logo fourni par OSM/Wikidata (P154) peut être daté (ex. l'ancien
// wordmark « Total ») alors que l'enseigne a changé d'identité visuelle.
// LOGO_OVERRIDES impose le logo ACTUEL d'une enseigne. Les fichiers sont
// servis par l'app elle-même (public/brands/) : aucun hotlink vers une URL
// arbitraire (NFR-SEC) et pas de dépendance à un hôte tiers au rendu.
const TOTALENERGIES_LOGO = '/brands/totalenergies.png'
const INTERMARCHE_LOGO = '/brands/intermarche.jpg'

/** Enseignes dont l'app fournit le logo en local, au lieu de Wikimedia. */
export const LOGO_OVERRIDES: Readonly<Record<string, string>> = {
  'Total': TOTALENERGIES_LOGO,
  'Total Access': TOTALENERGIES_LOGO,
  'TotalEnergies': TOTALENERGIES_LOGO,
  'Intermarché': INTERMARCHE_LOGO
}

/** Logo effectif d'une enseigne : le logo local par défaut PRIME (il porte
    l'identité visuelle ACTUELLE, ex. TotalEnergies au lieu de l'ancien
    wordmark Total de Wikimedia), sinon l'URL fournie validée, sinon null. */
export function displayLogoFor(brand: string | null | undefined, logoUrl: string | null | undefined): string | null {
  const key = brand?.trim()
  if (key && LOGO_OVERRIDES[key]) return LOGO_OVERRIDES[key]
  return isSafeLogoUrl(logoUrl) ? logoUrl : null
}

export function identityBadgeFor(input: {
  brand: string | null | undefined
  logoUrl: string | null | undefined
  name: string
}): StationIdentityBadge {
  const { brand, logoUrl, name } = input
  const label = brand?.trim() || name.trim() || 'Station'
  const initial = brand ? brandInitial(brand) : ''
  return { label, logoUrl: displayLogoFor(brand, logoUrl), initial, fallbackGlyph: initial || '⛽', alt: label }
}

// ——— Attribution OSM (ODbL) : la mention de licence exigée par la source des
// métadonnées d'identité (ticket 018/020, constante serveur
// OSM_METADATA_SOURCE_NAME). L'UI n'invente rien : elle affiche une note fixe
// référençant la source réelle. ———
export const OSM_ATTRIBUTION_NOTE =
  'Noms et logos des stations : OpenStreetMap © contributeurs OSM, licence ODbL'
