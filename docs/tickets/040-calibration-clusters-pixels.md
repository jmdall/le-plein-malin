---
id: 040
titre: Le seuil de clustering est une largeur à l'écran, pas une distance au sol
statut: done
dependances: [036, 039]
priorite: P1
estimation: S
---

# 040 — Les clusters ne regroupaient pas assez

**Ce que ça corrige :** `clusterRadiusKmForZoom` partait de « 2 km au zoom 11 »
et halvait à chaque zoom. Arithmétiquement, cela donne un rayon de fusion de
**38 px à tous les zooms** — la conversion km ↔ pixels est constante par
construction.

Or ce qui ne doit pas se chevaucher, c'est le **badge** :

| Élément | Largeur |
|---|---|
| Disque de cluster | 44 px |
| Badge prix + pastille d'enseigne | **~90 px** |

Deux marqueurs à 38 px étaient donc déclarés « sans chevauchement » alors que
leurs badges se recouvraient de moitié. La calibration était fausse d'un facteur
~2, et le seuil de 2 km n'avait jamais été relié à la taille réelle d'un badge.

Avant le ticket 039 le défaut se voyait peu : seules les stations du rayon de
recherche étaient affichées. Avec l'exploration libre, toute la zone se charge et
le problème saute aux yeux.

## Le vrai correctif : changer d'unité

Le problème n'était pas seulement que 2 km soit trop petit — c'est que la
constante était exprimée dans la **mauvaise grandeur**. « 2 km au zoom 11 » ne dit
rien de l'intention, cache un couplage à `MAP_START_ZOOM`, et ne peut pas être
confronté au CSS.

```
CLUSTER_MERGE_PIXELS = 100          // largeur d'un badge + marge
rayon(zoom, lat) = CLUSTER_MERGE_PIXELS × mètresParPixel(zoom, lat) / 1000
```

L'intention devient lisible et vérifiable : « fusionner ce qui se chevauche à
l'écran ». Le couplage au zoom d'ouverture disparaît.

La **latitude** entre dans le calcul (résolution Web Mercator : un pixel couvre
moins de terrain au nord). `StationMap` passe la latitude du centre de la carte ;
le défaut est le centre de la France métropolitaine.

## Mesures qui fondent le choix

9 483 stations Gazole de la base, viewport 1280×800 centré Paris, objets
réellement dans le viewport :

| Seuil | zoom 8 | zoom 11 | zoom 13 |
|---|---|---|---|
| **38 px (avant)** | 287 | **198** | 65 |
| 76 px | 89 | 83 | 42 |
| **100 px (retenu)** | 57 | **49** | 38 |
| 130 px | 35 | 34 | 25 |

100 px retenu : lisible sans être avare. Au zoom 13 il reste 17 stations
individuelles, donc on voit encore les stations une par une en s'approchant.
130 px descendrait à 34 mais regrouperait des badges qui ne se chevauchent pas
vraiment, forçant à zoomer pour rien.

Vérifié sur le rendu réel (Playwright, 1280×800, zoom 11) : **102 objets** au
total — le viewport **plus** la marge de préchargement de 1,6× du ticket 039, qui
charge et rend au-delà du bord visible.

## Effet secondaire favorable

Le nombre d'objets rendus devient à peu près **constant quel que soit le zoom** :
il vaut à peu près (aire du viewport) / (seuil en px)². C'est la propriété qu'on
veut d'un clustering d'écran, et elle n'existait pas avec un seuil exprimé en km.

## Réserves honnêtes

- Les chiffres valent pour un viewport desktop 1280×800. Sur mobile (~390 px),
  il y aura mécaniquement bien moins d'objets ; la calibration en pixels reste
  valable mais ce cas n'a pas été mesuré.
- `PRICE_BADGE_WIDTH_PX = 90` est déduit du CSS (font 0,78rem, ~5 caractères,
  pastille, padding 0,6rem × 2), pas mesuré au pixel dans un navigateur. C'est
  une borne de travail, d'où la marge à 100 px.

## Critères de fin

- Le rayon de fusion vaut `CLUSTER_MERGE_PIXELS` à **tous** les zooms (test).
- Le seuil couvre au moins la largeur d'un badge (test — garde anti-régression).
- Le rayon double d'un cran de dézoom, et dépend de la latitude (tests).
- Les 21 tests de comportement du clustering passent inchangés (ils utilisent un
  rayon fixe, indépendant de la calibration écran).
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`,
  `npm run build`, `npm run generate` verts (ticket 035).
