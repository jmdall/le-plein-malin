---
id: 030
titre: Upserts en lot (repositories + job de sync) — gain perf 100-500× sur les écritures
statut: done
dependances: []
priorite: P2
estimation: M
---

# 030 — Écritures en lot : repos profonds + job de sync optimisé

**Ce que ça livre :** le job de synchronisation (`server/jobs/syncPrices.ts`)
écrit ~365 000 lignes (73 000 stations × 5 carburants) **une par une** dans une
boucle `for`, chacune via un `tx.insert(...).onConflictDoUpdate(...).run()`
séparé — soit ~365 000 round-trips SQL séquentiels. Les `upsertMany` des
repositories font la même chose (boucle `for` sur `upsert`), et ne sont
**appelés nulle part** en production (code mort à l'usage, seul le test les
touche). Passer à des **inserts en lot** (`values([row1, row2, ...])` Drizzle,
un seul `INSERT ... ON CONFLICT DO UPDATE` multi-VALUES par table) donne un gain
de l'ordre de **100-500×** sur les écritures de la sync.

**Bloqué par :** rien. **Statut :** ready-for-agent

## Objectif

1. Les 3 repositories (stations, prices, priceHistory) ont un `upsertMany` **en
   lot** (`db.insert(table).values(rows).onConflictDoUpdate(...)`), testable,
   qui accepte le `tx` (transaction) en paramètre — car le job écrit dans une
   transaction better-sqlite3.
2. Le job de sync utilise les repos en lot au lieu de sa boucle d'inserts
   directs, en préservant :
   - le cas spécial des stations `isDefault` (nom = id, brand = null → on
     CONSERVE la valeur précédente, on n'écrase jamais un vrai nom par null) ;
   - la purge 48 h ;
   - l'écriture de la métadonnée lastSync.
3. Aucun changement de comportement : mêmes upserts, mêmes compteurs
   (stationsSynced/pricesSynced/historyAppended), mêmes tests verts.

## Décision d'interface (validée par grilling)

- `upsertMany` des repos accepte la transaction en premier paramètre :
  `upsertMany(tx, rows)` — le `tx` est de type
  `Parameters<Parameters<Db['transaction']>[0]>[0]` (comme dans le job).
  Quand appelé sans transaction (tests), il utilise `db` directement.
- Signature : `upsertMany(tx: Db | Transaction, rows)` où `Transaction` est le
  type du callback de `db.transaction`.
- `upsert` unitaire reste (utilisé par favoris/tests).

## Critères de fin

- `rg "for \(const row of rows\)"` dans `server/repositories/` : aucun résultat.
- Le job `syncPrices.ts` n'a plus de boucle d'inserts `tx.insert(...)` par ligne
  pour stations/prices/history — il appelle les `upsertMany` des repos en lot.
- `npm run test tests/unit/repositories.spec.ts tests/unit/sync.spec.ts` verts.
- `npm run typecheck`, `npm run lint`, `npm run test` TOUT vert.
- Le cas `isDefault` (stations) est préservé : un nom réel n'est jamais écrasé
  par un id.
