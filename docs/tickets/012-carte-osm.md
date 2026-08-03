---
id: 012
titre: Carte OpenStreetMap (stations dans le rayon, itinéraire)
statut: done
dependances:
  - "010"
priorite: P2
estimation: M
---

# 012 — Carte OpenStreetMap

**Ce que ça livre :** la vue carte OSM de la page principale (parcours §4, step 4) :
les stations du rayon positionnées sur une carte basée sur OpenStreetMap
(choix du cahier des charges §11, aucun service payant), la station de référence
et la station conseillée mises en évidence, et le bouton « Itinéraire » qui ouvre
un itinéraire vers la station (OSM, externe — pas de routage intégré au MVP,
D3/ADR-0002).

**Bloqué par :** 010 (page accueil, données de station partagées).

**Statut :** ready-for-agent

- [ ] Carte basée sur OpenStreetMap (ex. Leaflet avec tuiles OSM) affichant les
      stations du rayon, réutilisant les données `StationPrice[]` de l'API (009).
- [ ] Marquage visuel de la station de référence et de la station conseillée.
- [ ] Le bouton « Itinéraire » ouvre un lien de navigation OSM vers la station
      (pas de service payant) — accessible clavier et tactile ≥ 44 px.
- [ ] Marqueurs non-hiérarchiques uniquement par texte/symbole doublé
      (NFR-ACC-4) ; focus visible sur les marqueurs.
- [ ] La carte s'affiche sans JavaScript dégradé et ne bloque pas le rendu de la
      recommandation (NFR-PWA-2, NFR-PERF-1).
- [ ] Responsive (NFR-RES-1) ; les contrôles de carte (zoom, plein écran) sont
      accessibles.
- [ ] Aucun appel réseau supplémentaire vers un service cartographique payant.
- [ ] `npm run lint && npm run typecheck && npm run test` passe.
