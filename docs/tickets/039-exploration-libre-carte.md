---
id: 039
titre: Exploration libre de la carte — les stations ne disparaissent plus au déplacement
statut: done
dependances: [036, 037, 038]
priorite: P1
estimation: L
---

# 039 — Déplacer la carte ne doit rien effacer

**Ce que ça apporte :** la carte n'affiche que le résultat de la recherche par
rayon. Déplacer la carte relance cette recherche, donc les stations de la zone
quittée **disparaissent**, et voir une région — a fortiori la France — est
impossible.

Après ce ticket : les marqueurs se **cumulent**, on peut dézoomer jusqu'à la
France entière (en clusters), et rien ne s'effiace en pannant.

Les trois prérequis sont faits : clustering en O(n) (036), endpoint par emprise
(037), compression (038).

## Deux couches de marqueurs, deux rôles

| | Marqueurs de recherche | Marqueurs d'exploration |
|---|---|---|
| Source | `/api/stations` (rayon) | `/api/map/stations` (emprise) |
| Contenu | nom, enseigne, logo, distance, **économies** | position, prix, fraîcheur |
| Popup | complète (itinéraire, économie nette) | **aucune** — le clic zoome |
| Rôle | décider | repérer |

Une station présente dans les deux couches est rendue **une seule fois**, avec
sa version riche : la couche de recherche gagne toujours.

### Pourquoi le clic sur un marqueur d'exploration zoome

Mesuré : embarquer le nom des stations dans la charge utile d'emprise coûte
**+34 Ko gzip** (108 → 142 Ko, +31 %) pour la France entière. Sans le nom, on ne
peut pas afficher une popup honnête — et l'app n'affiche jamais un identifiant à
la place d'un nom.

Le clic zoome donc, comme sur un cluster. En zoomant, la recherche par rayon
couvre la zone et la station devient un marqueur riche avec sa popup complète.
Aucun octet de plus, aucune popup asynchrone à charger.

## Couleur des marqueurs d'exploration

**Décision produit prise : la distribution de ce qui est affiché.** Un marqueur
est d'autant plus vert que son prix est bas **parmi les stations actuellement
visibles**.

Conséquence assumée : une même station change de couleur quand on déplace la
carte. La légende doit donc dire exactement ça — « moins cher / plus cher **que
les stations visibles** » — sinon la couleur devient impossible à interpréter.

L'échelle est bâtie sur les **déciles** (p10 → p90) et non sur min/max : une
seule station aberrante écraserait sinon tout le dégradé sur une extrémité.

Les marqueurs de **recherche** gardent leur `attractiveness` actuelle, calculée
côté serveur par rapport à la **station de référence** : c'est la comparaison qui
décide d'un détour, et elle ne change pas.

## Recommandation au déplacement

**Décision produit prise : seulement en zoom rapproché.** Au-delà de
`RECOMMENDATION_MIN_ZOOM`, le pan relance la recommandation comme aujourd'hui.
En dessous, c'est de l'exploration pure : les marqueurs se chargent, la
recommandation garde la dernière position explicite.

Relancer une recherche de rayon 10 km autour d'un centre arbitraire pendant qu'on
regarde la France ne veut rien dire — et ça coûte deux appels API par pan.

## Décisions d'interface

- `app/utils/mapBounds.ts`, **module pur** :
  - `expandBounds(bounds, factor)` : on charge un peu plus large que le viewport,
    pour qu'un petit pan ne déclenche pas un appel ;
  - `isBoundsCovered(candidate, loaded[])` : vrai si l'emprise demandée est déjà
    entièrement contenue dans une emprise déjà chargée ⇒ aucun appel.
- `app/composables/useMapStations.ts` : magasin `Map<id, MapStation>` **fusionné**,
  jamais vidé sur un pan. Vidé en revanche au **changement de carburant** — les
  prix stockés sont ceux d'un seul carburant.
- `domain/fuel-prices/priceAttractiveness.ts` gagne
  `computeVisiblePriceScale(prices)` et `computeAttractivenessInScale(price, scale)`.
- `StationMap` émet `bounds` (débouncé, sur `moveend`) et reçoit
  `browseStations`.

## Invariants respectés

- **Aucun prix inventé** : un marqueur d'exploration affiche le prix de l'API.
- **Fraîcheur** : les prix périmés restent visibles et atténués, jamais promus.
- **REC-2/D1** : aucune règle métier recalculée côté client. L'échelle de couleur
  est un dégradé d'affichage, pas une décision — et la légende le dit.
- **La carte ne bouge JAMAIS seule** (demande produit) : charger des marqueurs ne
  déplace pas la vue.
- **LOC-4** : l'emprise vient de la carte, jamais la position de l'utilisateur.

## Critères de fin

- Panner ne fait disparaître aucun marqueur déjà chargé.
- Dézoomer jusqu'à la France affiche des clusters sur tout le territoire.
- Panner à l'intérieur d'une zone déjà chargée ne déclenche **aucun** appel.
- Sous le seuil de zoom, un pan ne relance **pas** la recommandation.
- Au-dessus, il la relance comme avant.
- Une station de la recherche n'est jamais doublée par un marqueur d'exploration.
- La légende parle des « stations visibles ».
- TDD sur `mapBounds`, l'échelle de couleur et la fusion du magasin.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`,
  `npm run build`, `npm run generate` verts (ticket 035).

## Trouvé pendant l'implémentation

### La légende recouvrait les marqueurs

Première version : chaque ligne de légende portait la phrase complète
(« Moins cher que les stations affichées »). La carte-légende a triplé de largeur
et s'est mise à **recouvrir les marqueurs** — le test tactile existant l'a
attrapé : `elementFromPoint` sur le badge du marqueur recommandé renvoyait
`.map-legend-row`.

Répéter la même phrase sur trois lignes était de mauvais design de toute façon.
La référence est désormais annoncée **une seule fois**, en tête :

```
Prix vs stations affichées
● Moins cher   ● Plus cher   ● Prix périmé
```

### `expandBounds(b, 1)` ne couvrait pas `b`

Repasser par `centre ± demi-étendue` introduit une dérive flottante
(48.9 → 48.89999999999999). Suffisant pour que `isBoundsCovered` réponde faux sur
l'emprise d'origine — donc rechargement en boucle de la même zone. Un facteur
≤ 1 renvoie maintenant l'emprise telle quelle.

### Les tests de la couche « rayon » tapaient la vraie base

Les quatre tests e2e existants de la carte ne mockaient pas
`/api/map/stations` : la couche d'exploration servait les ~9 500 stations de la
base locale et noyait la carte sous **175 clusters** au lieu d'un. Ce n'était pas
un défaut du produit — c'est la fonctionnalité qui marche — mais ces tests
portent sur la couche « rayon ». Ils neutralisent désormais explicitement la
couche d'exploration (`mockEmptyBrowse`), qui a son propre test dédié.

## Vérifié

Test e2e dédié, sur le comportement observable :

- les marqueurs d'exploration se cumulent ; dézoomer en ajoute sans en retirer ;
- panner **à l'intérieur** d'une zone déjà chargée ne déclenche **aucun** appel
  (compteur d'appels stabilisé avant mesure, pour ne pas attribuer au pan un
  chargement de zoom encore en vol) ;
- la légende annonce à quoi la couleur se compare.

496 tests unitaires + 17 e2e verts, lint, typecheck, build et generate propres.
