---
id: 008
titre: Job de synchronisation Nitro (upsert + historique + purge 48 h)
statut: done
dependances:
  - "006"
  - "007"
priorite: P1
estimation: M
---

# 008 — Job de synchronisation Nitro

**Ce que ça livre :** le job périodique Nitro qui synchronise la base avec la
source officielle : pagination (jamais un fetch par station, NFR-PERF-2), upsert
des `stations` et `prices`, **append** quotidien de `price_history` (upsert
`(station_id, fuel, day)`, D4/ADR-0004), purge des prix > 48 h hors
recommandations, et tolérance à l'échec partiel (aucune écriture partielle
douteuse). La base reste toujours cohérente et l'historique alimente la tendance
(005) et l'API (009).

**Bloqué par :** 006 (schéma), 007 (provider).

**Statut :** ready-for-agent

- [x] Job Nitro planifié (fréquence type 2 à 4 ×/jour, configurable via env) —
      cohérent avec la fréquence observée de la source (recherche §5).
- [x] Synchronisation complète : upsert `stations` + `prices`, append
      `price_history` du jour (un seul snapshot par station/carburant/jour).
- [x] Tolérance à l'échec partiel : un appel qui échoue ne détruit pas les
      données existantes ; retentative au tick suivant ; aucun écriture partielle
      douteuse (recherche §12, ADR-0003).
- [x] Purge : les prix de plus de 48 h sont retirés des recommandations mais
      restent visibles avec badge dans la liste (FRE-3, spec §9.6).
- [x] Marquage `synced_at` exploité par le cache TTL (007) et le health-check
      (009).
- [x] Tests : intégration sur base de test — run à vide (aucun prix),
      upsert (nouvelle station puis mise à jour du même jour), append quotidien
      (2 jours différents → 2 lignes), échec partiel simulé (données intactes),
      purge 48 h.
- [x] `npm run lint && npm run typecheck && npm run test` passe.

**Scénarios de test liés :** #17 (repli pendant la synchro), #18 (cache servi
depuis la base synchronisée, jamais > 24 h sans signalement).
