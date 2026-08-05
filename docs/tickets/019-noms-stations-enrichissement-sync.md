---
id: 019
titre: Noms réels et logos des stations — enrichissement à la synchronisation
statut: done
dependances:
  - "017"
  - "018"
priorite: P1
estimation: M
---

# 019 — Enrichissement à la synchronisation

**Ce que ça livre :** quand le job périodique synchronise les prix (ticket 008),
il enrichit chaque station avec son **nom réel**, son **enseigne** et son
**logo** — OSM d'abord (018), repli dérivation adresse (017) pour les stations
non trouvées. En base, `stations.name` cesse d'être un id illisible : la donnée
de display est prête avant toute requête. La mention de source OSM est stockée
pour l'UI.

**Bloqué par :** 017 (dérivation adresse), 018 (provider OSM).

**Statut :** ready-for-agent

- [ ] Le job `server/jobs/syncPrices.ts` appelle l'enrichisseur de métadonnées
      après l'upsert des stations (dédupliquées par id), sans toucher aux prix.
- [ ] L'enrichissement suit la même stratégie que la chaîne de repli :
      OSM best-effort, repli dérivation adresse (017), sinon nom par défaut = id
      (aucun nom fabriqué, invariant CONTEXT.md).
- [ ] Les colonnes `name`, `brand`, `brand_wikidata_id`, `logo_url` sont
      renseignées/écrasées lors de l'upsert ; une station sans match garde son
      `name` = id et `brand` = null.
- [ ] La mention de source OSM (attribution ODbL) est conservée (ex. via
      `last_sync` ou une constante) pour que 021 l'affiche.
- [ ] Le déclenchement manuel `POST /api/sync` (ticket antérieur) applique le
      même enrichissement.
- [ ] Le cache SQLite (`createCacheProvider`) renvoie les champs enrichis dans
      les `StationPrice` (name réel, brand, logo_url) — aucune requête de prix
      ne régresse.
- [ ] Tests : le job enrichit correctement une station (fixtures OSM + adresse),
      et ne casse pas le run à vide / la purge 48 h.
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

> Contexte : invariant CONTEXT.md « aucun nom/prix inventé » — la dérivation
> adresse est une liste de mots-clés d'enseignes réelles, jamais de fantaisie ;
> le nom OSM est la donnée réelle d'OSM. Le logo vient de l'entité Wikidata.
