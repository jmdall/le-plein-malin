---
id: 006
titre: Schéma Drizzle + SQLite + migrations + accès de base
statut: ready-for-agent
dependances:
  - "001"
  - "002"
priorite: P1
estimation: M
---

# 006 — Schéma Drizzle + SQLite + migrations

**Ce que ça livre :** le schéma de persistance conforme au §9 de la spec
(stations, prices, price_history, vehicle_profile, favorites), les migrations
et une couche d'accès type repository, prêts pour le provider (007), le job de
synchronisation (008) et l'API (009). Le domaine métier (002–005) reste pur :
aucune règle métier ne vit dans cette couche.

**Bloqué par :** 001 (scaffold), 002 (types `FuelType` partagé).

**Statut :** ready-for-agent

- [ ] `server/db/schema.ts` (Drizzle) déclare les 5 tables du §9 avec leurs
      colonnes, types et contraintes exacts :
      - `stations` : id text PK, name, brand null, address, city, postal_code,
        latitude, longitude, department_code null, region_code null, closed
        boolean, synced_at.
      - `prices` : station_id FK CASCADE, fuel (`FuelType`), price, updated_at,
        rupture boolean, synced_at ; PK `(station_id, fuel)`.
      - `price_history` : station_id FK, fuel, day (YYYY-MM-DD), price,
        synced_at ; PK `(station_id, fuel, day)` — upsert quotidien (D4).
      - `vehicle_profile` : id integer PK autoincrement (singleton, 1 ligne).
      - `favorites` : station_id FK, created_at ; PK station_id.
- [ ] Index : `(fuel, day)` sur price_history, `(station_id, fuel)` sur prices
      (NFR-PERF-3).
- [ ] Migrations générées et reproductibles (drizzle-kit) ; une base de test
      vierge est créée par `npm run db:migrate`.
- [ ] Repository léger (`server/repositories/`) : upsert stations/prices,
      upsert quotidien price_history, lecture par (fuel, rayon, centre),
      favorites, véhicule singleton — sans logique métier.
- [ ] `vehicle_profile` : seed d'une ligne par défaut (seuil 1 €) utilisable
      quand le client n'a pas encore de profil localStorage (VEH-4).
- [ ] `npm run lint && npm run typecheck && npm run test` passe (tests
      d'intégration DB sur SQLite en mémoire ou fichier temporaire).

**Scénarios de test liés :** socle de #17 (cache serveur), #18 (données mises en
cache, purge 48 h) et de #6 (exclusion stations sans prix/rupture/fermeture au
niveau base).
