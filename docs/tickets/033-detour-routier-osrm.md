---
id: 033
titre: Détour routier (OSRM) derrière un seam, repli haversine
statut: done
dependances: []
priorite: P1
estimation: L
---

# 033 — Le coût du détour doit être mesuré sur la route

**Ce que ça corrige :** le **coût du détour** est calculé sur une distance en
ligne droite. La route est presque toujours plus longue, donc le coût est
sous-estimé et l'**économie nette** surestimée. La règle
`économie nette >= seuil de rentabilité` recommande alors des détours qui ne
sont pas rentables en réalité.

C'est la limite du MVP la plus visible (`README.md`) et le principal écart
technique relevé face à `pouvoirachatplus.fr`, qui route via OSRM.

Décision d'architecture : **ADR-0005** (révise D3, ne touche pas ADR-0002/D2 —
la formule du détour est inchangée, seule la mesure des distances change).

## Objectif

1. Seam `RouteDistanceProvider` (`server/providers/routeDistance.ts`) :
   `tableFromOrigin(origin, destinations) → Array<number | null>` (km).
2. Implémentation OSRM `/table` : **un seul appel HTTP par recherche**, gratuit,
   sans clé. Cache SQLite par couple (origine, destination).
3. Seam unique de résolution des distances
   (`server/lib/station-distances.ts`) : les **quatre** sites qui recodent
   aujourd'hui `haversineKm(center, s.position)` passent par lui.
4. `FuelRecommendationInput.detourSource` : l'hypothèse affichée dit quelle
   mesure a réellement servi.

## Décisions d'interface

- `RouteDistanceProvider.tableFromOrigin(origin, destinations)` : distances
  routières en km, **dans l'ordre des destinations**, `null` par destination
  sans route. Ne lève pas pour une destination isolée ; lève si l'appel entier
  échoue (le seam de résolution attrape et replie).
- OSRM : `{base}/table/v1/driving/{lon},{lat};…?sources=0&annotations=distance`.
  Réponse `{ code: 'Ok', distances: [[0, d1, …]] }` en **mètres**.
  Plafond de coordonnées du serveur public : au-delà de
  `OSRM_MAX_DESTINATIONS` (99), les destinations en excès reçoivent `null`
  (donc haversine) — et le plafond est **journalisé**, jamais silencieux.
- `resolveStationDistances({ center, stations, route })` →
  `{ withDistance, source }` où `source: 'road' | 'straight-line'`.
  - `source: 'road'` **seulement si toutes** les stations ont une distance
    routière. Partiel ⇒ `'straight-line'` : on n'affiche pas une promesse qu'on
    ne tient pas pour toutes les candidates, même si les nombres routiers
    disponibles sont bien utilisés.
  - Sans provider (ou provider en échec) ⇒ haversine partout.
- `FuelRecommendationInput.detourSource?: 'road' | 'straight-line'` — **défaut
  `straight-line`**, donc les 18 scénarios du cahier des charges restent
  inchangés.
- Cache : table `route_distance_cache`, clé `origine|destination` arrondie à 3
  décimales, TTL 30 jours. Même style que `geocode_cache`.
- Variables : `ROUTE_DISTANCE_PROVIDER` (`osrm` par défaut, `none` pour
  désactiver), `OSRM_BASE_URL`, `OSRM_TIMEOUT_MS` (2500).

## Invariants respectés

- **Module pur** : `calculateFuelRecommendation` reçoit toujours des km déjà
  calculés. Aucun HTTP, aucun SQLite, aucun env dans `domain/`.
- **ADR-0002/D2** : formule du détour inchangée.
- **Aucune donnée inventée** : une distance routière inconnue devient haversine,
  et l'hypothèse affichée le dit.
- **Le rayon reste haversine** : on ne re-filtre pas sur la distance routière
  (voir ADR-0005, « Conséquences »).
- **§11** : aucun service payant.

## Critères de fin

- Une recherche déclenche **au plus un** appel OSRM (vérifié par compteur).
- OSRM indisponible / timeout / `code != Ok` ⇒ distances haversine, recherche
  fonctionnelle, `detourSource: 'straight-line'`.
- Deuxième recherche au même endroit ⇒ **zéro** appel OSRM (cache).
- `detourSource: 'road'` ⇒ l'hypothèse parle du réseau routier ; `'straight-line'`
  ⇒ le texte actuel est conservé mot pour mot.
- `hasGeoLocation` et `detourSource` sont indépendants : une recherche ville/CP
  avec routage réussi reste partielle.
- Les 18 scénarios de `tests/unit/recommendation.spec.ts` passent inchangés.
- TDD sur le provider OSRM, le cache, `resolveStationDistances` et les
  hypothèses du module pur.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e` verts.

## Vérifié

Réponse réelle du service `/table` (confirme le parsing, écrit d'après la spec) :

```
GET /table/v1/driving/2.3522,48.8566;2.36,48.87;2.34,48.85?sources=0&annotations=distance
{"code":"Ok","distances":[[0,2740.8,1589.1]], "destinations":[…]}
```

Les distances sont en **mètres**, la colonne 0 est la source vers elle-même.
Écart mesuré avec la ligne droite : **+71 %** et **+37 %** (voir ADR-0005).

**Un appel par recherche, pas deux.** Le client appelle deux endpoints
(`/api/stations` puis `/api/recommendation`) pour la même zone. Le premier
déclenche l'appel OSRM ; le second trouve tout en cache et n'en fait aucun.
