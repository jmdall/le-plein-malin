// utils/mapAnimation.ts — Déplacement progressif des marqueurs de la carte
// (ticket 012 ; demande produit « déplacer la carte devrait y aller
// progressivement »). Module client pur : aucune dépendance Leaflet, seule
// l'interpolation mathématique est ici.
//
// Un marqueur Leaflet est un divIcon posé en dur sur sa coordonnée : pendant
// un pan qui renvoie de nouvelles coordonnées de station, un `setLatLng`
// direct ferait « sauter » le badge d'une station à l'autre (il disparaît et
// réapparaît ailleurs). On interpole donc la position sur ~500 ms — le badge
// glisse au lieu de sauter. Si une nouvelle cible arrive en cours de route,
// on repart de la position courante (qui suit déjà la trajectoire), jamais
// du point de départ (pas d'accumulation de jitter).
export interface LatLngPoint {
  lat: number
  lng: number
}

// « Layer » minimal suffisant pour animer : getLatLng/setLatLng. Le Marker
// Leaflet s'y conforme structurellement.
export interface AnimatedLayer {
  getLatLng(): LatLngPoint
  setLatLng(position: LatLngPoint): void
}

export const MARKER_ANIMATE_MS = 500

// Ordonnanceur d'images injectable (testable sans RAF).
export interface FrameScheduler {
  request(callback: () => void): number
  cancel(handle: number): void
  now(): number
}

export const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => Date.now()
}

// Interpolation linéaire entre deux points (maths pures).
export function interpolateLatLng(start: LatLngPoint, end: LatLngPoint, t: number): LatLngPoint {
  return {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t
  }
}

// Poignées d'animation par layer (WeakMap : aucun champ ajouté au marqueur).
const animFrames = new WeakMap<object, number>()

export function animateMarkerLatLng(
  layer: AnimatedLayer,
  target: LatLngPoint,
  scheduler: FrameScheduler = rafScheduler
): void {
  const start = layer.getLatLng()
  const finiteTarget = Number.isFinite(target.lat) && Number.isFinite(target.lng)
  // Cible déjà atteinte, ou coordonnées non finies (jamais de position
  // corrompue) : pas d'animation, pas de setLatLng non plus.
  if (
    !finiteTarget ||
    (start.lat === target.lat && start.lng === target.lng)
  ) {
    return
  }
  const prev = animFrames.get(layer)
  if (prev !== undefined) scheduler.cancel(prev)
  const t0 = scheduler.now()
  const tick = () => {
    const t = Math.min(1, (scheduler.now() - t0) / MARKER_ANIMATE_MS)
    layer.setLatLng(interpolateLatLng(start, target, t))
    if (t < 1) {
      animFrames.set(layer, scheduler.request(tick))
    } else {
      animFrames.delete(layer)
    }
  }
  animFrames.set(layer, scheduler.request(tick))
}
