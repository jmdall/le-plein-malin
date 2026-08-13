---
id: 036
titre: Clustering en grille — O(n) au lieu de O(n·k), prérequis de l'exploration libre
statut: done
dependances: []
priorite: P1
estimation: M
---

# 036 — Le clustering ne tient pas à l'échelle de la France

**Ce que ça corrige :** `buildStationClusters` compare chaque marqueur à **tous
les clusters déjà formés** (`app/utils/stationClusters.ts`, boucle imbriquée).
C'est O(n·k). Sur les 9 604 stations de la base (9 483 avec du Gazole), mesuré :

| Zoom | Rayon de fusion | Temps | Résultat |
|---|---|---|---|
| 6 | 64 km | 159 ms | 144 clusters |
| 8 | 16 km | **1 234 ms** | 1 823 clusters |
| 10 | 4 km | **4 344 ms** | 0 cluster, 9 500 individuels |
| 12 | 1 km | **3 972 ms** | 0 cluster, 9 500 individuels |

Recalculé à chaque zoom, c'est injouable. C'est le **prérequis** de l'exploration
libre de la carte (ticket 038) : sans lui, la fonctionnalité est impossible, pas
seulement lente.

## Objectif

Même résultat, indexé dans l'espace. Une **grille de hachage** de côté
`mergeRadiusKm` : pour placer un marqueur, on n'examine que les clusters des
**9 cellules voisines** (3×3) au lieu de tous.

C'est **exact**, pas approché : avec une cellule d'AU MOINS R km de côté, tout
cluster à une distance ≤ R du marqueur se trouve forcément dans l'une des 9
cellules. Le cluster retenu reste donc « le plus proche à moins de R », comme
aujourd'hui.

Conséquence : **les tests existants passent inchangés**. Ce n'est pas un
changement de comportement, c'est un changement de complexité.

## Décisions d'interface

- Signature publique inchangée :
  `buildStationClusters(markers, mergeRadiusKm) → StationClusterView`.
- Grille : côté de cellule = `mergeRadiusKm`, converti en degrés.
  - latitude : `mergeRadiusKm / 111.19` ;
  - longitude : `mergeRadiusKm / (111.19 × cos(latMax))` où `latMax` est la
    latitude la plus haute du jeu. Une cellule uniforme est nécessaire (un
    `cos(lat)` par point rendrait les frontières irrégulières), mais elle doit
    être dimensionnée sur le cos le PLUS PETIT : un degré de longitude vaut
    `111,19 × cos(lat)` km, donc une cellule d'un pas fixe se rétrécit en km
    vers le nord. Sous R km, un cluster à moins de R tombe à deux cellules et
    échappe à la fenêtre 3×3 — voir « Divergence trouvée » plus bas.
- Le centroïde d'un cluster **bouge** quand il absorbe un marqueur. S'il change
  de cellule, il est **réindexé** — sinon la garantie 3×3 tomberait et le
  résultat divergerait de l'implémentation actuelle.
- La distance de décision reste `haversineKm` (pas une distance de grille) :
  la grille ne sert qu'à réduire les candidats, jamais à décider.

## Invariants conservés

- Les points d'ancrage (référence, recommandée) ne sont **jamais** regroupés.
- `attractiveness` du cluster = MAX des membres (la station la plus « verte »).
- `minPrice` = MIN des membres **frais** (ticket 034).
- Ordre de parcours des marqueurs conservé (greedy séquentiel) : à égalité de
  distance, le même cluster gagne qu'aujourd'hui.

## Critères de fin

- Les tests existants de `tests/unit/station-clusters.spec.ts` passent **sans
  modification** (c'est la preuve de non-régression).
- Test de charge : 9 500 marqueurs, zoom 10 → **< 500 ms** (référence actuelle :
  4 344 ms). Borne large pour ne pas être instable en CI.
- Test d'équivalence : sur un jeu pseudo-aléatoire, le résultat est identique à
  celui de l'implémentation naïve (mêmes groupes, mêmes centroïdes).
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`,
  `npm run build`, `npm run generate` verts (ticket 035).

## Divergence trouvée pendant l'implémentation

Première version : `cos` fixe pris au centre de la France (46,5°). Les tests
d'équivalence à 400 et 900 marqueurs passaient. À l'échelle réelle, non :

```
n=9500 r=16 : expected 1824 to be 1823
```

Au nord de 46,5°, `cos(lat)` est plus petit, donc une cellule d'un pas fixe en
degrés mesure MOINS de R km de large. Un cluster à moins de R km pouvait alors se
trouver à deux cellules et échapper à la fenêtre 3×3 : un marqueur créait un
cluster de plus au lieu de rejoindre le sien.

Corrigé en dimensionnant le pas sur la latitude la plus haute du jeu. Les
cellules du sud sont un peu plus larges que nécessaire — quelques candidats de
plus à examiner, aucune perte d'exactitude, et aucun coût mesurable.

Deux tests de régression ciblés ont été ajoutés (fusion tout au nord à 51,03°,
et jeu étalé de 41° à 51,5°), en plus du cas d'équivalence à 9 500 marqueurs qui
a révélé le problème.

## Résultat mesuré

| Zoom | Avant (O(n·k)) | Après (grille) | Gain |
|---|---|---|---|
| 6 | 159 ms | 39 ms | ×4 |
| 8 | 1 234 ms | 42 ms | ×29 |
| 10 | 4 344 ms | 38 ms | ×114 |
| 12 | 3 972 ms | 21 ms | ×189 |
| 14 | 3 554 ms | 14 ms | ×254 |

9 500 marqueurs, France métropolitaine. Résultat identique à l'implémentation
naïve, prouvé par test à chacune de ces échelles.
