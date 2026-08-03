---
id: 004
titre: Module pur calculateFuelRecommendation (TDD, 18 scénarios §13)
statut: ready-for-agent
dependances:
  - "002"
  - "003"
priorite: P0
estimation: L
---

# 004 — Module pur `calculateFuelRecommendation` (TDD, 18 scénarios §13)

**Ce que ça livre :** le cœur métier du produit : la fonction pure
`calculateFuelRecommendation(input): FuelRecommendation` qui, à partir des
distances déjà calculées (km) et des prix normalisés fournis en entrée, produit
une recommandation explicable parmi les 5 types, avec confiance, raisons,
données utilisées/ignorées, calculs, hypothèses, fraîcheur et marquage
`isPartial` (spec §10). C'est le **seam de test principal et unique** : les 18
scénarios du §13 s'écrivent ici en TDD, sans mock d'infrastructure.

**Bloqué par :** 002 (types), 003 (fraîcheur).

**Statut :** ready-for-agent

- [ ] Le module est pur : aucun import Nuxt/HTTP/SQLite/env (vérifié par test
      d'import interdit).
- [ ] Formules exactes (CONTEXT.md / spec §5.5) : coût du détour =
      `detourDistanceKm × conso/100 × prix candidat` (D6), économie brute =
      `(prix réf − prix candidat) × quantité`, économie nette = brute − détour.
- [ ] `go-to-station` si et seulement si `économie nette ≥ seuil` (strict,
      égalité comprise — CAL-3) ; `recommendedStation` = meilleure `netSavings`.
- [ ] `partial-fill` : `X = min(quantité rentabilisant le détour, capacité −
      niveau, preferredQuantity)` (D5) ; si même le plein complet ne rentabilise
      pas → `wait`/`fill-now` selon niveau et tendance.
- [ ] Niveau critique (≤ 10 % capacité) → biais `fill-now` même en tendance
      baissière ; niveau élevé → `wait`/`partial-fill`.
- [ ] Données fraîcheur : candidate `obsolete` (> 48 h) exclue par défaut ;
      `stale` dégrade la confiance ; écarté si alternative fraîche.
- [ ] `isPartial: true` dès qu'une donnée manque (pas de tendance, pas de
      géoloc, prix non résolu) — jamais inféré de la confiance (D1).
- [ ] Prix aberrant hors intervalle documenté → `ignoredData`, exclu du calcul
      local ; données incohérentes → recommandation dégradée, jamais d'exception.
- [ ] Retour immuable avec **tous** les champs du type `FuelRecommendation`
      remplis (raisons, usedData, ignoredData, calculations, assumptions,
      freshness).
- [ ] TDD : les 18 scénarios du §13 sont couverts par des tests Vitest **écrits
      avant** le code de la règle correspondante ; le code minimal fait passer
      chaque test ; refactor puis re-test.
- [ ] Formulation de tendance toujours probabiliste (« tendance probable »),
      jamais une certitude (REC-4).
- [ ] `npm run lint && npm run typecheck && npm run test` passe (tous les tests
      du §13 verts).

**Scénarios de test liés :** les 18 scénarios du §13 du cahier des charges /
spec §11 (chacun = un critère d'acceptation du module, cf. le tableau).
