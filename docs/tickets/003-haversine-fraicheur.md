---
id: 003
titre: Haversine pure + fraîcheur dans domain/fuel-prices (TDD)
statut: done
dependances:
  - "002"
priorite: P0
estimation: S
---

# 003 — Haversine pure + fraîcheur (domain/fuel-prices)

**Ce que ça livre :** les deux briques pures que le serveur utilise avant le
calcul de recommandation : une fonction **haversine** (distance en km entre deux
points, sans routage — D3/ADR-0002, spec §5.1-LOC-5) et le calcul de
**fraîcheur** d'un prix (`ageInHours`, statut `fresh`/`stale`/`obsolete` selon
les seuils 24 h / 48 h, score 0..1 — spec §6). Ces fonctions sont le deuxième
seam de test du produit (spec §10.4).

**Bloqué par :** 002 (types).

**Statut :** ready-for-agent

- [ ] `domain/fuel-prices/haversine.ts` : distance haversine en km entre deux
      `GeoPoint`, pure (aucune dépendance hors domaine) ; testée en TDD.
- [ ] `domain/fuel-prices/freshness.ts` : calcule `FreshnessInfo` à partir de
      `updatedAt` et de l'heure courante injectée (pour la testabilité) ;
      statuts exacts `fresh` (≤ 24 h), `stale` (24–48 h), `obsolete` (> 48 h) ;
      score décroissant 0..1 (≤ 24 h → 1).
- [ ] L'heure courante est injectée comme paramètre (aucune lecture `Date.now()`
      dans le corps pur).
- [ ] TDD : tests Vitest écrits avant le code, un par seuil (24 h pile, 24 h+1,
      48 h pile, 48 h+1), plus 2 cas haversine connus (même point = 0, distance
      type Gennevilliers–Paris ~ 12 km à tolérance documentée).
- [ ] Aucun import Nuxt/HTTP/SQLite/env dans ces fichiers.
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

**Scénarios de test liés :** §13 #4 (prix > 24 h → `stale`), #5 (prix > 48 h →
`obsolete`), #15 (distance/tolérance), et l'infrastructure des distances de #13
et #16 (haversine côté serveur).
