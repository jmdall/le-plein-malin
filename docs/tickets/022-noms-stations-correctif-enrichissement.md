---
id: 022
titre: "Bug : marqueurs de prix sans icône ni enseigne — la base n'était jamais enrichie"
statut: done
dependances:
  - "019"
  - "021"
priorite: P1
estimation: M
---

# 022 — Correctif : les noms/enseignes/logos des stations n'arrivaient jamais à l'UI

**Symptôme :** la carte (et la liste) affichaient des ids (`75001003`) au lieu
des noms réels / enseignes / logos. L'UI (021) était correcte ; la DONNÉE était
le problème : 9604 stations avec `name=id`, `brand=null`, `logo_url=null`,
`address=''`.

**Causes racines (toutes corrigées) :**

1. `server/providers/normalize.ts` lisait `raw.address` alors que le champ réel
   de l'API/export Opendatasoft est `adresse` → adresse vide partout → la
   dérivation d'enseigne (017) ne pouvait jamais matcher.
2. `server/providers/osmMetadata.ts` n'envoyait pas de `User-Agent` → Overpass
   répond HTTP 406 → l'enrichissement OSM (019) échouait silencieusement ([]).
3. Overpass est intermittent (504/429) sans retentative → lots rendus vides.
4. Résolution de logo Wikidata en `Promise.all` massif (~5700 fetch simultanés)
   → 429 généralisés → 0 logo. Corrigé par un pool borné + déduplication par
   `brand:wikidata` (un fetch par enseigne, jamais par station).
5. L'API `/api/stations` et `/api/recommendation` servaient les providers de
   prix (qui renvoient `name=id, brand=null`) sans réinjecter l'identité réelle
   stockée en base → l'UI voyait l'id dès que la source était joignable.
   Corrigé par `enrichStationsWithDbIdentity` (server/lib/orchestration.ts) :
   fusion best-effort de l'identité de la base par id.

**Livré :**

- `scripts/enrich-stations.ts` : re-enrichissement idempotent d'une base
  existante (adresses réelles depuis l'export + identité OSM → dérivation →
  identité existante).
- Base locale re-enrichie (`data/app.db`, non versionnée) : 9604 adresses,
  5719 enseignes réelles (Intermarché, Total, Carrefour, TotalEnergies, Avia,
  Esso, …), 5555 noms réels, 3116 logos.

**Vérification :** `npm run lint && npm run typecheck && npm run test`
(263 tests) + e2e (9 tests). L'API `/api/stations`, `/api/recommendation` et
`/api/stations/:id` renvoient les noms/enseignes/logos réels.
