---
id: 027
titre: Seuil de fraîcheur 24/48 h — seam unique + retrait du champ inerte freshnessLimits
statut: done
dependances: []
priorite: P2
estimation: M
---

# 027 — Fraîcheur : un seul module de seuils, plus de seam inerte

**Ce que ça livre :** le même invariant métier (fraîcheur 24 h / 48 h, score
linéaire décroissant) est aujourd'hui implémenté à **5 endroits** :
`domain/fuel-prices/freshness.ts`, `domain/trend/calculateTrend.ts`
(`computeFreshnessScore`), `domain/recommendation/calculate.ts` (`computeFreshness`),
et les hardcodes `freshnessLimits: { staleAfterHours: 24, obsoleteAfterHours: 48 }`
injectés par l'orchestration (désormais `server/lib/recommendation-input.ts`).
Pire : ce champ `freshnessLimits` de `FuelRecommendationInput` n'est **jamais lu**
par l'implémentation — c'est un **seam fictif** (la revue domaine l'a vérifié par
`rg`, 0 occurrence lue). Modifier le seuil nécessite 5 fichiers.

**Bloqué par :** le chantier 1 (découpage d'orchestration.ts, fait — les hardcodes
sont maintenant dans `server/lib/recommendation-input.ts`).

**Statut :** ready-for-agent

## Objectif

1. Un **module unique** de fraîcheur dans `domain/fuel-prices/freshness.ts` porte
   les seuils 24/48 et le score. `domain/trend/calculateTrend.ts` consomme ce
   module au lieu de réimplémenter `computeFreshnessScore`.
2. Le champ inerte `freshnessLimits` est **supprimé** de `FuelRecommendationInput`
   (et des callers : `server/lib/recommendation-input.ts` et `tests`). Le module
   `recommendation/calculate.ts` lit les seuils depuis `domain/fuel-prices/freshness`
   (seule source).
3. Aucun changement de comportement : les seuils restent 24/48 h, le score reste
   linéaire décroissant. TDD : un test de régression vérifie que le seuil vit au
   même endroit pour la recommandation et la tendance.

## Critères de fin

- `rg "24"` / `rg "48"` sur `domain/` ne remonte que **une** paire de constantes
  (dans `domain/fuel-prices/freshness.ts`), pas de duplication.
- `rg "freshnessLimits"` ne remonte **aucun** résultat (champ supprimé).
- `domain/trend/calculateTrend.ts` n'a plus de `computeFreshnessScore` propre.
- `npm run typecheck`, `npm run lint`, `npm run test` verts (les tests existants
  de freshness/trend/recommendation passent inchangés).
