// utils/mapBounds.ts — Emprises de la carte (ticket 039). Module PUR : aucune
// dépendance Leaflet, Nuxt ou HTTP. Il décide quoi charger et — surtout — quoi
// NE PAS recharger : sans la couverture, chaque micro-pan déclencherait un appel.

export interface MapViewBounds {
  swLat: number
  swLon: number
  neLat: number
  neLon: number
}

// On charge plus large que le viewport pour qu'un petit déplacement retombe
// dans une zone déjà chargée. 1,6 : ~60 % de marge, soit un pan d'un quart
// d'écran dans n'importe quelle direction sans nouvel appel.
export const BOUNDS_EXPANSION = 1.6

// Bornes terrestres : l'emprise élargie part vers l'API, qui refuse des
// coordonnées invalides. En dézoom extrême il ne faut pas dépasser.
const MAX_LAT = 90
const MAX_LON = 180

export function expandBounds(bounds: MapViewBounds, factor: number): MapViewBounds {
  // Un facteur ≤ 1 renvoie l'emprise TELLE QUELLE, sans repasser par
  // centre ± demi-étendue. Ce recalcul introduit une dérive flottante
  // (48.9 → 48.89999999999999) qui suffirait à ce que l'emprise élargie ne
  // couvre plus son propre point de départ : `isBoundsCovered` répondrait faux
  // et la carte rechargerait la même zone en boucle.
  if (factor <= 1) return { ...bounds }

  const halfLat = ((bounds.neLat - bounds.swLat) / 2) * factor
  const halfLon = ((bounds.neLon - bounds.swLon) / 2) * factor
  const centerLat = (bounds.swLat + bounds.neLat) / 2
  const centerLon = (bounds.swLon + bounds.neLon) / 2
  return {
    swLat: Math.max(-MAX_LAT, centerLat - halfLat),
    neLat: Math.min(MAX_LAT, centerLat + halfLat),
    swLon: Math.max(-MAX_LON, centerLon - halfLon),
    neLon: Math.min(MAX_LON, centerLon + halfLon)
  }
}

// Vrai si `candidate` est entièrement contenue dans AU MOINS UNE des emprises
// déjà chargées. Volontairement simple : on ne teste pas la couverture par
// l'union de plusieurs emprises. Au pire on refait un appel — jamais on
// n'affiche une zone incomplète en croyant l'avoir chargée.
export function isBoundsCovered(candidate: MapViewBounds, loaded: MapViewBounds[]): boolean {
  return loaded.some(
    (b) =>
      candidate.swLat >= b.swLat &&
      candidate.neLat <= b.neLat &&
      candidate.swLon >= b.swLon &&
      candidate.neLon <= b.neLon
  )
}
