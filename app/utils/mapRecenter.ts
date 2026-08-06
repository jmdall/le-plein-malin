// utils/mapRecenter.ts — Décision « faut-il recentrer la carte ? » (ticket
// 012 ; demande produit « déplacer la carte devrait afficher les stations »).
// Module client pur : aucune dépendance Leaflet, aucune règle d'UI.
//
// Contexte : quand la position de recherche change (nouvelle recherche ville/
// CP, bouton géoloc, rayon/carburant, recentrage par pan), la carte doit se
// recentrer sur le centre des données. MAIS pendant une recherche déclenchée
// par un pan, les données intermédiaires portent ENCORE l'ancien centre (la
// recommandation répond avant la liste des stations) : la carte, que
// l'utilisateur vient de déplacer, ne doit pas « revenir » sur l'ancien
// centre. On ne récentre donc que si aucune recherche par pan n'est en cours
// (panSearchCenter), et que le centre des données diffère du dernier centre
// réclamé par la carte (lastFlownCenter).
export interface CenterPoint {
  lat: number
  lon: number
}

export interface RecenterInput {
  /** Centre porté par les données courantes (view.center). */
  dataCenter: CenterPoint | null
  /** Centre d'une recherche déclenchée par un pan, le cas échéant. */
  panSearchCenter: CenterPoint | null
  /** Dernier centre que la carte a « réclamé » (init, flyTo, pan). */
  lastFlownCenter: CenterPoint | null
}

export interface RecenterDecision {
  fly: boolean
  target: CenterPoint | null
}

export function sameCenter(a: CenterPoint, b: CenterPoint): boolean {
  return a.lat === b.lat && a.lon === b.lon
}

export function shouldRecenter(input: RecenterInput): RecenterDecision {
  const { dataCenter, panSearchCenter, lastFlownCenter } = input
  if (!dataCenter) {
    return { fly: false, target: null }
  }
  // Recherche par pan en cours : les données intermédiaires portent encore
  // l'ancien centre — l'utilisateur contrôle la carte, on ne la ramène pas.
  if (panSearchCenter && !sameCenter(dataCenter, panSearchCenter)) {
    return { fly: false, target: null }
  }
  // Les données portent déjà le centre de la carte : rien à faire.
  if (lastFlownCenter && sameCenter(dataCenter, lastFlownCenter)) {
    return { fly: false, target: null }
  }
  // Nouveau centre de recherche légitime → recentrer.
  return { fly: true, target: dataCenter }
}
