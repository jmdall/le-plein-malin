---
id: 028
titre: Chaîne de repli des providers — une seule fonction paramétrée par rayon
statut: done
dependances: []
priorite: P2
estimation: M
---

# 028 — Chaîne de repli : un seul module, plus d'ordre de sources dupliqué

**Ce que ça livre :** l'ordre de repli des sources de prix (Opendatasoft API →
export JSON → roulez-eco.fr → cache, ou export prioritaire pour la France
entière) est aujourd'hui dupliqué à **4 endroits** avec des variantes :
`server/providers/syncChain.ts` (export d'abord, pour le job), `stations.get.ts`
et `recommendation.get.ts` (records d'abord, identiques), et `sync.post.ts`
(records d'abord si `radiusKm ≤ 100`, export d'abord sinon). La règle
« rayon → ordre des sources » est une décision documentée (ADR-0003, recherche
§13) qui a fui dans les routes. Modifier l'ordre = éditer 4 fichiers.

**Bloqué par :** chantier 1 (le découpage d'orchestration.ts, fait).

**Statut :** ready-for-agent

## Objectif

1. Une seule fonction qui construit la chaîne selon le rayon, consommée par
   `stations.get.ts`, `recommendation.get.ts`, `sync.post.ts` et `schedule.ts`
   (via `syncChain.ts`).
2. La règle `radiusKm ≤ 100 → records-first ; sinon → export-first` vit dans un
   seul module (avec les commentaires sur le plafond 3000 records/carburant).
3. Aucun changement de comportement : mêmes ordres qu'aujourd'hui dans chaque
   cas, mêmes providers, mêmes replis.
4. TDD : le choix de l'ordre selon le rayon est testé.

## Décision d'interface (validée par grilling)

- La fonction vit dans `server/providers/` (à côté de `syncChain.ts`), par ex.
  `server/providers/providerChain.ts` exportant `createProviderChain(db, radiusKm)`.
- Elle retourne un `FuelPriceProvider` (chaîne de repli).
- `radiusKm` détermine l'ordre : `≤ 100` → Opendatasoft → export → roulez-eco →
  cache ; `> 100` (France entière) → export → Opendatasoft → roulez-eco → cache.
- `syncChain.ts` reste mais appelle la fonction avec un rayon large (France) —
  ou est remplacé par un appel direct dans `schedule.ts`.

## Critères de fin

- `rg "createFallbackChain"` ne remonte que dans `providerChain.ts` (et ses
  tests) ; plus aucune route ne construit sa propre chaîne.
- `rg "createOpendatasoftProvider"` / `createJsonExportProvider` /
  `createRoulezEcoProvider` / `createCacheProvider` dans `server/api/` : aucun
  résultat (les routes importent la chaîne unique).
- `npm run typecheck`, `npm run lint`, `npm run test` verts.
- Aucun changement de comportement (mêmes ordres, mêmes replis).
