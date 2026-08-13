---
id: 032
titre: Le déplacement de carte ne doit pas se faire passer pour une géolocalisation
statut: done
dependances: [031]
priorite: P1
estimation: S
---

# 032 — Un centre de carte n'est pas la position de l'utilisateur

**Ce que ça corrige :** déplacer la carte relance la recherche autour du
nouveau centre (`onMapRecenter`, `app/pages/index.vue`) en envoyant `lat`/`lon`
sans `positionSource`. Le serveur applique donc le défaut `device` et considère
que l'utilisateur **se trouve** au centre de la carte.

Conséquence, via `server/lib/recommendation-input.ts` →
`domain/recommendation/calculate.ts` :

- `hasGeoLocation: true` ⇒ `isPartial` n'est plus forcé ;
- l'hypothèse **« Détour estimé en ligne droite, aller-retour, relatif à la
  station la plus proche (absence de géolocalisation) »** disparaît de la
  recommandation.

Or l'utilisateur qui explore la carte n'est pas au centre de la zone qu'il
regarde — souvent il en est loin. La recommandation est donc présentée avec
**moins de réserves que la donnée n'en autorise**, ce qui contredit le
**niveau de confiance** de `CONTEXT.md` (« dégradé par : … détour approximatif,
absence de géolocalisation ») et l'invariant « une tendance n'est jamais
présentée comme une certitude », dont l'esprit vaut pour tout le raisonnement.

**Défaut préexistant** au ticket 031 : il est arrivé avec la recherche au
déplacement de carte. Le ticket 031 a créé le vocabulaire nécessaire
(`positionSource`, mode `place`) sans l'appliquer à ce parcours, faute de
décision produit.

**Décision produit prise :** appliquer `place`. Le **coût du détour** reste
une hypothèse quand on ne sait pas où est l'utilisateur, et l'app doit le dire.

## Objectif

`onMapRecenter` envoie `positionSource: 'place'`. Le centre de la carte reste
exactement celui du pan (aucun changement de géographie) ; seule la franchise
de la recommandation change.

**Ne change pas :** `locate()` (FAB « Recentrer sur ma position ») garde
`device` — c'est bien la position de l'appareil.

## Effet attendu sur l'affichage

Après un déplacement de carte, la recommandation :

- est marquée partielle (`isPartial`) ;
- affiche l'hypothèse de détour en ligne droite.

C'est le même niveau de réserve qu'une recherche ville/CP — ce qui est correct,
puisque l'information disponible est la même.

## Critères de fin

- Un pan émet `positionSource=place` vers `/api/recommendation` **et**
  `/api/stations`.
- Le FAB de recentrage n'émet aucun `positionSource` (défaut `device`).
- Le centre géographique envoyé après un pan est inchangé.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e` verts.
