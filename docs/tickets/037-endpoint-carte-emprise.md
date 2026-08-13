---
id: 037
titre: Endpoint carte par emprise — servir les stations d'une bbox, payload léger
statut: done
dependances: [036]
priorite: P1
estimation: M
---

# 037 — La carte doit pouvoir demander une zone, pas un rayon

**Ce que ça apporte :** aujourd'hui la carte n'affiche que le résultat de la
recherche par **rayon** (5/10/20/30 km) autour d'un centre. Déplacer la carte
relance cette recherche, donc les stations de la zone quittée **disparaissent**,
et il est impossible de voir une région entière.

Cet endpoint sert une **emprise** (bounding box) : c'est la brique dont
l'exploration libre (ticket 039) a besoin. Il ne remplace rien —
`/api/stations` reste la source de la liste et des grandeurs d'économie.

## Deux concerns distincts, deux endpoints

| | `/api/stations` | `/api/map/stations` |
|---|---|---|
| Question | « où faire le plein ? » | « qu'y a-t-il dans cette zone ? » |
| Géométrie | rayon autour d'un centre | emprise |
| Charge utile | complète (économies, détour, identité, fraîcheur, attractivité) | minimale |
| Station de référence | oui | **non** — hors rayon elle n'a pas de sens |

L'endpoint carte ne calcule **aucune** grandeur d'économie : sans station de
référence, une **économie nette** n'existe pas. Il ne fait que dire où sont les
stations et à quel prix.

## Mesures qui fondent le dimensionnement

Sur la base réelle (9 604 stations, 9 483 avec du Gazole) :

| Emprise | Lignes | Requête |
|---|---|---|
| France entière | 9 483 | **12,65 ms** |
| Île-de-France | 909 | 5,65 ms |
| Paris centre | 94 | 4,93 ms |

Le plan passe par `SCAN prices` + recherche par clé primaire sur `stations`.
**Aucun index géographique n'est ajouté** : 12,65 ms pour le pire cas ne le
justifie pas, et une migration a un coût de maintenance réel. À revoir si le jeu
de données change d'ordre de grandeur.

Charge utile France entière, format plat : **833 Ko brut**. La compression des
réponses API est absente (vérifié sur le serveur bâti : aucun `content-encoding`)
— c'est l'objet du **ticket 038**, qui ramène ce chiffre à ~107 Ko.

## Décisions d'interface

- `GET /api/map/stations?swLat=&swLon=&neLat=&neLon=&fuel=`
- Réponse :

```ts
interface MapStationsResponse {
  stations: Array<{
    id: string
    lat: number
    lon: number
    price: number
    ageInHours: number
    status: 'fresh' | 'stale' | 'obsolete'
  }>
  bounds: { swLat: number; swLon: number; neLat: number; neLon: number }
  fuel: FuelType
  truncated: boolean
}
```

- **Forme plate** et non `freshness: { … }` imbriqué : mesuré 833 Ko contre
  981 Ko sur 9 483 stations, pour la même information.
- `status` et `ageInHours` viennent du **serveur** (`domain/fuel-prices/freshness`) :
  l'UI ne recalcule aucune règle de fraîcheur (REC-2/D1).
- Coordonnées **arrondies à 5 décimales** (~1,1 m) : précision d'affichage, pas
  une donnée inventée — l'écart est très inférieur à la taille d'un marqueur.
- Bornes validées par `latSchema`/`lonSchema` (donc France métropolitaine, spec
  §14 #14) **et** cohérentes : `swLat < neLat`, `swLon < neLon`, sinon 400.
- Stations **fermées** exclues (`closed = 0`), comme partout ailleurs.
- Plafond `MAP_MAX_STATIONS` avec `truncated: true` et un log. Il ne peut pas se
  déclencher avec les données actuelles (l'emprise est bornée à la France, donc
  le maximum est la taille du jeu) : c'est une garde pour le jour où l'une des
  deux hypothèses tombe. Jamais silencieux.

## Invariants respectés

- **Aucun prix inventé** : seules les lignes réellement en base sortent.
- **Module pur** : la fraîcheur vient de `domain/fuel-prices/freshness`, aucune
  règle recodée dans l'endpoint.
- **Pas de position utilisateur** : l'emprise vient de la carte, la position
  précise n'est ni transmise ni journalisée (LOC-4).

## Critères de fin

- L'endpoint renvoie les stations d'une emprise, avec prix et fraîcheur.
- Emprise incohérente ou hors France → 400 structuré.
- Une station sans prix pour le carburant demandé n'apparaît pas.
- Une station fermée n'apparaît pas.
- TDD : schéma Zod, requête d'emprise sur base de test, arrondi, plafond.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`,
  `npm run build`, `npm run generate` verts (ticket 035).

## Vérifié sur la base réelle

Serveur bâti (`node .output/server/index.mjs`), base de développement
(9 604 stations) :

| Requête | Réponse |
|---|---|
| France entière, Gazole | HTTP 200, **9 483 stations**, 879 Ko brut / **127 Ko gzip**, 103 ms |
| Paris centre, SP98 | HTTP 200, 76 stations, 8,4 Ko, 7 ms |
| Emprise inversée | HTTP 400 « swLat doit être strictement inférieur à neLat » |
| Emprise hors France (La Réunion) | HTTP 400 |

### Correction trouvée à la mesure

La première version renvoyait **1,03 Mo** et non les 833 Ko attendus : l'âge
sortait du domaine en flottant complet (`294.30294055555555`), soit 18 caractères
par station. Arrondi à l'heure → 879 Ko.

L'arrondi ne peut pas déplacer un seuil de fraîcheur : le `status` est calculé
par le domaine sur la valeur **exacte** et transmis explicitement. Un test le
verrouille (24,4 h → `ageInHours: 24` mais `status: 'stale'`) — c'est précisément
pourquoi le client ne redérive pas le statut depuis l'âge.

### Observation hors périmètre

Toutes les stations de la base locale ressortent `obsolete` (âge ~294 h) : le job
de synchronisation n'a pas tourné depuis ~12 jours sur cette base de
développement. Rien à voir avec cet endpoint — mais à savoir avant de juger un
affichage « tout gris » en local.
