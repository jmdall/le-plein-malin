---
id: 016
titre: Noms réels et logos des stations — modèle de données enrichi
statut: ready-for-agent
dependances:
  - "012"
priorite: P1
estimation: M
---

# 016 — Modèle de données enrichi (nom réel + enseigne + logo)

**Ce que ça livre :** la base de données sait désormais distinguer le nom réel
d'une station, son enseigne (marque), son identifiant Wikidata et l'URL de son
logo. Aujourd'hui `stations.name` contient l'id technique DGCCRF (ex. `75001003`)
et `brand` est toujours `null` : les écrans affichent des ids illisibles. Ce
ticket pose les colonnes et l'accès, sans changer l'affichage (dépend de 020/021).

**Bloqué par :** 012 (carte — les écrans consomment déjà `ListedStation`, on
ajoute des champs sans rien casser). Aucun autre ticket de ce chantier.

**Statut :** ready-for-agent

- [ ] Colonnes ajoutées à `stations` : `brand_wikidata_id` (text, nullable) et
      `logo_url` (text, nullable) ; `brand` existant reste nullable.
- [ ] Une migration Drizzle (`server/db/migrations/0002_*.sql`) qui ajoute les
      colonnes ; la base existante migre sans perte (schema actuel de 0000/0001
      conservé).
- [ ] `server/db/schema.ts` reflète les nouvelles colonnes ; le schéma compilé
      ne casse aucun repo existant (compile + lint + tests passent).
- [ ] Le repo stations (`server/repositories/stations.ts`) upsert inclut les
      nouvelles colonnes (`brand_wikidata_id`, `logo_url`) et `findById` les
      retourne ; les insertions existantes (sync, favoris) restent compatibles
      (colonnes nullables, `Omit<StationRow,'id'>` adapté).
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

> Note de recherche : le flux DGCCRF (API Opendatasoft + XML roulez-eco) ne
> publie **aucun champ enseigne** ; le nom réel/enseigne/logo viendront d'OSM
> (ticket 018) avec repli dérivation adresse (017). Ce ticket ne fait que la
> forme de persistance (spec §9.1, ADR-0003).
