---
id: 041
titre: Une emprise de carte n'est pas un centre de recherche — bornes terrestres
statut: done
dependances: [037, 039]
priorite: P1
estimation: S
---

# 041 — Dézoomer renvoyait un 400

**Ce que ça corrige :** `/api/map/stations` validait les quatre coins de
l'emprise avec `latSchema`/`lonSchema`, bornés à la France métropolitaine
(-5,5..9,8 en longitude). Dézoomer produit forcément une fenêtre plus large que
le territoire :

| Zoom | Largeur viewport (1280 px) | En degrés de longitude | ×1,6 (`expandBounds`) | Verdict |
|---|---|---|---|---|
| 6 | 2 155 km | 28,2° | 45,1° | **400** |
| 7 | 1 078 km | 14,1° | 22,5° | **400** |
| 8 | 539 km | 7,0° | 11,3° | ok |

Autrement dit : **tout zoom ≤ 7 échouait** — exactement dézoomer pour voir la
France, la fonctionnalité du ticket 039.

## Erreur de catégorie

Les bornes France valent pour un **centre de recherche** : « où l'utilisateur
cherche à faire le plein » (spec §14 #14). Les appliquer à un **viewport** était
une confusion. Une fenêtre qui déborde sur l'Atlantique est parfaitement
légitime ; la bonne réponse est « les stations du territoire qui s'y trouvent »,
éventuellement aucune — jamais une erreur.

`/api/stations` garde évidemment les bornes France : un centre hors territoire
reste refusé.

## Aucune intersection à calculer

Réflexe initial : rogner l'emprise sur le territoire avant la requête. Inutile —
les tests du builder passaient **déjà** sans rien changer. Le `BETWEEN` SQL
sélectionne les stations dans la fenêtre, et toutes les stations sont de toute
façon dans le territoire. Une fenêtre plus large ne peut rien ramener de faux, et
une fenêtre entièrement dehors ne ramène rien.

Le correctif se réduit donc au schéma : bornes **terrestres**
(`mapLatSchema`/`mapLonSchema`, ±90 / ±180). Moins de code que prévu.

## Ce qui reste refusé

- Coordonnée hors bornes terrestres.
- Emprise inversée ou dégénérée (`swLat >= neLat`, `swLon >= neLon`) : ce n'est
  pas une zone, c'est une erreur d'appel.

## Pourquoi les tests ne l'avaient pas vu

Le test e2e du ticket 039 dézoomait de deux crans depuis le zoom 11, soit
jusqu'au zoom 9 — il n'atteignait jamais les zooms qui cassent. Il dézoome
maintenant bien plus bas et **vérifie qu'aucune emprise n'aurait été refusée**, en
appliquant dans le mock les mêmes bornes que le schéma serveur.

## Vérifié sur le serveur bâti

| Cas | Avant | Après |
|---|---|---|
| Emprise zoom 7 | 400 | 200 — 9 415 stations |
| Emprise zoom 6 | 400 | 200 — 9 483 stations |
| Emprise mondiale | 400 | 200 — 9 483 stations |
| Plein Atlantique | 400 | 200 — liste vide |
| Longitude −181 | 400 | 400 |
| Emprise inversée | 400 | 400 |
| `/api/stations` centre à La Réunion | 400 | 400 |
