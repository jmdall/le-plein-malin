---
id: 007
titre: Provider FuelPriceProvider (Opendatasoft) + cache TTL + repli automatique
statut: done
dependances:
  - "002"
  - "003"
  - "006"
priorite: P1
estimation: L
---

# 007 — Provider `FuelPriceProvider` (Opendatasoft) + cache TTL + repli

**Ce que ça livre :** l'abstraction du provider et son implémentation principale
(API Opendatasoft `prix-carburants-quotidien` sur data.economie.gouv.fr,
ADR-0003), la normalisation des enregistrements en `StationPrice[]` du domaine,
le cache SQLite avec TTL (1 h minimum) et la **bascule automatique de repli**
Opendatasoft → export JSON complet → roulez-eco.fr XML → cache (spec §10,
ADR-0003, recherche §13). Le domaine (002–005) ne voit jamais le format
gouvernemental.

**Bloqué par :** 002 (types), 003 (haversine/fraîcheur), 006 (schéma).

**Statut :** ready-for-agent

- [x] `server/providers/types.ts` : interface `FuelPriceProvider` avec
      `findNearbyStations(query)` (spec §10 / cahier des charges §10) + types de
      requête (lat/lon ou ville/CP, rayon, fuel).
- [x] Implémentation Opendatasoft : pagination `limit/offset` (jamais un fetch
      par station — NFR-PERF-2), filtre spatial `within_distance` (syntaxe
      réelle vérifiée : `within_distance(geom,geom'POINT(lon lat)',10km)`),
      normalisation `prix_nom` (Gazole/SP95/SP98/E10/E85/GPLc) → `FuelType`,
      `prix_valeur` normalisée en nombre (CSV = chaîne, JSON = nombre),
      `prix_maj` → Date.
- [x] Mapping des champs : adresse/ville/cp/geom ; `rupture` et `fermeture`
      non nuls → exclu pour ce carburant (CAR-3) ; station fermée → `closed`.
- [x] Normalisation → le domaine reçoit des `StationPrice[]` (jamais de
      « geom: null » sans prix — exclus, recherche §9).
- [x] Cache SQLite : TTL 1 h minimum appliqué ; un cache de plus de 24 h n'est
      jamais servi sans signalement explicite (FRE-2) ; `synced_at` exploitable.
- [x] Repli automatique par ordre de priorité (Opendatasoft → export complet →
      roulez-eco.fr XML → cache) ; chaque source produit `StationPrice[]` ;
      échec total → erreur explicite sans aucun prix inventé (ADR-0003, §13 #17).
- [x] Tests Vitest : provider testé avec fixtures réelles de la recherche
      (record Gazole de Gennevilliers, cas `geom: null`, `rupture`), chaîne de
      repli testée en injectant des échecs simulés, TTL vérifié avec horloge
      injectée.
- [x] `npm run lint && npm run typecheck && npm run test` passe.

**Scénarios de test liés :** #6 (station sans carburant/rupture/fermeture →
exclue), #17 (échec source → repli automatique, aucun prix inventé), #18 (cache
servi avec `synced_at` et badge).
