---
id: 005
titre: Calculateur de tendance domain/trend (TDD, moyenne/médiane/variations/score)
statut: done
dependances:
  - "002"
  - "003"
priorite: P0
estimation: M
---

# 005 — Calculateur de tendance `domain/trend` (TDD)

**Ce que ça livre :** le second module pur : `calculateTrendIndicators` qui, à
partir d'une série de snapshots quotidiens locaux, produit les indicateurs du
§9/TRE-2 : prix minimum local, moyenne, médiane, écart à la médiane, variation
24 h (J−1) et 7 j (J−7), tendance (baisse / stable / hausse) et score de
fraîcheur — par un algorithme **déterministe et explicable** (TRE-3, ADR-0004).
Il fournit aussi le signal de tendance que `calculateFuelRecommendation` (004)
consomme via le `FuelRecommendationInput`.

**Bloqué par :** 002 (types), 003 (seuils de fraîcheur 24 h/48 h).

**Statut :** done — implémenté en TDD rouge→vert→refactor (17 tests dans
`tests/unit/trend.spec.ts` + test de pureté relais). `npm run lint && npm run
typecheck && npm run test` passe (56 tests au total).

- [x] `domain/trend/types.ts` : type `TrendIndicators` (min, moyenne, médiane,
      écart médiane, Δ24 h, Δ7 j, tendance `'down'|'stable'|'up'`,
      freshnessScore).
- [x] `domain/trend/calculateTrend.ts` : algorithme déterministe (moyenne,
      médiane, variations absolue/relative, pondération par ancienneté) avec
      seuils documentés et explicables ; l'historique est fourni en entrée
      (jamais lu de la base).
- [x] Moins de 2 points de comparaison (J−1 ou J−7 indisponible) → tendance
      `insufficient` et le module de recommandation continue sur les prix
      locaux courants (recommandation partielle, TRE-4 / D4).
- [x] Score de fraîcheur découlant des règles 24 h / 48 h (TRE-5), cohérent
      avec `FreshnessInfo` de 003.
- [x] TDD : tests Vitest écrits avant le code — série stable (→ `stable`),
      série montante (→ `up`), descendante (→ `down`), moins de 2 points (→
      `insufficient`), médiane paire/impaire, écart à la médiane.
- [x] Module pur (aucun import Nuxt/HTTP/SQLite/env) — vérifié par test.
- [x] `npm run lint && npm run typecheck && npm run test` passe.

**Scénarios de test liés :** §13 #7 (historique insuffisant → `isPartial`,
décision sur prix courants) ; la tendance alimente #8, #9 et #16.
