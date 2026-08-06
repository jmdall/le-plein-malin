---
id: 021
titre: Noms réels et logos des stations — affichage dans l'interface
statut: done
dependances:
  - "020"
priorite: P1
estimation: M
---

# 021 — Affichage noms réels + logos dans l'interface

**Ce que ça livre :** l'utilisateur voit enfin **le vrai nom** de chaque station
(ex. « Carrefour Market », « TotalEnergies ») et son **logo d'enseigne** partout
où une station apparaît : carte (marqueurs + popups), liste, favoris,
recommandation. Aujourd'hui il ne voit que des ids (`75001003`). La mention de
source OSM (ODbL) est affichée comme demandé par la licence.

**Bloqué par :** 020 (les payloads portent les champs).

**Statut :** ready-for-agent

- [ ] Carte (StationMap.vue) : les marqueurs affichent le logo seul à gauche du
      prix (nom court retiré du badge — le logo suffit, le nom réel est dans la
      popup et le nom accessible) ; la popup affiche le nom réel + l'enseigne +
      le logo.
- [ ] Liste (StationCard.vue / StationList.vue) : le nom réel remplace l'id
      quand il est disponible ; l'enseigne et le logo s'affichent (fallback
      élégant si pas de logo : pictogramme ⛽ ou initiale, jamais une image
      cassée).
- [ ] Favoris (pages/favoris.vue) : même présentation que la liste (nom réel +
      logo/enseigne via `/api/stations/:id`).
- [ ] Recommandation (RecommendationCard.vue) : le nom réel de la station
      recommandée/de référence, pas l'id.
- [ ] Le logo n'est jamais un vecteur d'information unique (NFR-ACC-4) : le nom
      réel est toujours présent en texte, l'image est décorative avec `alt=""`
      ou un `alt` descriptif.
- [ ] Source OSM affichée (ex. note « Noms et logos : OpenStreetMap ©
      contributeurs OSM, ODbL ») — comme demandé par la licence.
- [ ] Aucune couleur/seuil/calcul nouveau : purement l'affichage de champs déjà
      fournis par l'API (REC-2/D1). Aucune image cassée : `onerror` neutre.
- [ ] Tests e2e existants (stations, station-map, recommendation) adaptés si un
      sélecteur dépendait de l'ancien nom=id — intention préservée, signalé.
- [ ] `npm run lint && npm run typecheck && npm run test` passe ; rendu
      vérifié visuellement (liste + carte + favoris, clair/sombre, mobile).

> Contexte : docs/design/ui-reference.md §4 — le badge marqueur porte le logo de
> l'enseigne à gauche du prix, comme PouvoirAchat+ ; c'est la signature visuelle
> cible. NFR-ACC-4 : le nom réel en texte prime toujours sur l'image.
