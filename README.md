# ⛽ Je fais le plein ou non ?

[![Tests](https://img.shields.io/github/actions/workflow/status/jmdall/le-plein-malin/ci.yml?branch=main&job=test&label=tests)](https://github.com/jmdall/le-plein-malin/actions/workflows/ci.yml)
[![E2E](https://img.shields.io/github/actions/workflow/status/jmdall/le-plein-malin/ci.yml?branch=main&job=e2e&label=e2e)](https://github.com/jmdall/le-plein-malin/actions/workflows/ci.yml)
[![Build](https://img.shields.io/github/actions/workflow/status/jmdall/le-plein-malin/ci.yml?branch=main&job=build&label=build)](https://github.com/jmdall/le-plein-malin/actions/workflows/ci.yml)

Application web **mobile-first** qui aide un automobiliste en France à décider,
avec une recommandation **explicable** et fondée sur les **prix officiels** :

- **faire le plein maintenant** ;
- **mettre seulement X litres** ;
- **attendre** ;
- **aller dans une autre station moins chère**.

Aucun prix n'est inventé : toutes les données proviennent de la source
officielle DGCCRF (ou du cache local, signalé comme tel).

## Fonctionnalités

- Géolocalisation avec consentement, recherche par ville ou code postal, rayon
  5 / 10 / 20 / 30 km, utilisation sans géolocalisation.
- Carburants : SP95, SP95-E10, SP98, E85, Gazole, GPLc (préférence mémorisée).
- Liste des stations : prix, distance, fraîcheur (badges 24 h / 48 h), économie
  brute, coût du détour, économie nette, favoris, itinéraire OSM.
- Carte OpenStreetMap (Leaflet, tuiles libres, aucun service payant).
- Profil véhicule : consommation, capacité, niveau, quantité souhaitée, seuil
  d'économie (défaut 1 €) — stocké en base, sans compte utilisateur.
- Tendance locale déterministe (min / moyenne / médiane, Δ24 h / Δ7 j),
  toujours formulée « tendance probable », jamais une certitude.
- PWA installable : shell hors-ligne explicite, **aucun prix périmé hors-ligne**.
- Mode sombre, navigation clavier, contrastes AA, mobile-first.

## Stack

Nuxt 4 · Vue 3 · TypeScript strict · Nitro · SQLite (Drizzle ORM) · Zod ·
Vitest · Playwright · ESLint · Docker · PWA · Leaflet/OSM.

## Structure

Nuxt 4 (`srcDir` = `app/`) :

```
app/          assets · components · composables · pages · utils · app.vue
server/       API Nitro, jobs, providers, repositories
domain/       modules métier purs (aucune dépendance Nuxt/HTTP/SQLite)
shared/       types partagés app + server
public/       ressources statiques (offline.html, icônes)
tests/        unitaires (Vitest) + e2e (Playwright)
docs/         spec, ADR, tickets, recherche, agents
```

## Prérequis

- Node.js ≥ 20 (testé avec Node 22) et npm.
- (Optionnel) Docker pour le lancement conteneurisé.
- (Optionnel) une clé API DeepSeek **uniquement** pour utiliser OpenCode avec
  le modèle imposé (pas nécessaire pour faire tourner l'application).

## Installation

```bash
npm install
cp .env.example .env
```

### Configuration DeepSeek pour OpenCode (développement assisté)

Le dépôt impose un modèle unique pour OpenCode : **DeepSeek V4 Flash via l'API
officielle DeepSeek** (`https://api.deepseek.com/v1`). La configuration est
dans `opencode.json` (provider `deepseek`, modèle `deepseek/deepseek-v4-flash`).

```bash
export DEEPSEEK_API_KEY=sk-...            # ou dans .env
opencode --model deepseek/deepseek-v4-flash
```

Ne pas utiliser OpenRouter, OpenCode Zen/Go, un modèle automatique, de modèle
de secours, ni un autre modèle (Claude, GPT, Gemini, Codex).

## Lancement local

```bash
npm run dev        # http://localhost:3000
```

La base SQLite est créée et migrée automatiquement au premier accès
(`./data/app.db`, git-ignoré). Le job de synchronisation des prix tourne
toutes les 2 h par défaut (`SYNC_INTERVAL_HOURS`).

## Lancement Docker

```bash
docker compose up --build
# http://localhost:3000 — base SQLite dans le volume sqlite-data
```

## Tests

```bash
npm run lint
npm run typecheck
npm run test          # unitaires + intégration (Vitest)
npm run test:e2e      # end-to-end (Playwright, port 3100)
npm run build         # build de production Nitro
```

Sur Raspberry Pi (arm64 / Debian 11), Playwright utilise le chromium système
(`/usr/bin/chromium`) ; la suite e2e tourne avec 1 worker et des timeouts
élargis (`playwright.config.ts`).

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `NITRO_PORT` | `3000` | Port HTTP |
| `NITRO_HOST` | `localhost` | Hôte d'écoute (`0.0.0.0` en Docker) |
| `DATABASE_PATH` | `./data/app.db` | Fichier SQLite |
| `SYNC_INTERVAL_HOURS` | `2` | Fréquence du job de synchronisation |
| `FUEL_PRICES_PROVIDER` | `opendatasoft` | Fournisseur principal des prix |
| `ROUTE_DISTANCE_PROVIDER` | `osrm` | Distances routières (`none` = haversine seul) |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | Instance OSRM (auto-hébergeable) |
| `OSRM_TIMEOUT_MS` | `2500` | Timeout du routage avant repli haversine |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | — | OpenCode uniquement (dev) |

## Source des données

**« Prix des carburants en France – Flux quotidien » (DGCCRF, Ministères
économiques et financiers)** — licence ouverte `fr-lo`. Détails vérifiés et
documentés dans `docs/research/fuel-data-source.md` :

- API : `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants-quotidien/records`
  (état courant, 73 493 enregistrements, champs `prix_nom`, `prix_valeur`,
  `prix_maj`, `geom`…).
- Repli automatique : export JSON complet → fichier quotidien XML
  `donnees.roulez-eco.fr/opendata/jour` → cache SQLite.
- Le domaine métier ne dépend jamais du format gouvernemental : abstraction
  `FuelPriceProvider` (ADR-0003).

## Synchronisation des prix

Le job Nitro (`server/jobs/syncPrices.ts`) synchronise périodiquement :
upsert des stations et prix (transaction unique), snapshot quotidien dans
`price_history` (alimente la tendance), neutralisation des prix > 48 h hors
recommandations (toujours visibles avec badge), tolérance à l'échec partiel.
`GET /api/health` expose `lastSync`.

## Algorithme de recommandation

Module métier **pur** `calculateFuelRecommendation` (`domain/recommendation/`,
TDD, 18 scénarios du cahier des charges) — aucune dépendance Nuxt/HTTP/SQLite :

```
coût du détour  = distance supplémentaire A/R × conso / 100 × prix candidat
économie brute  = (prix référence − prix candidat) × quantité
économie nette  = économie brute − coût du détour
aller à une autre station  ⇔  économie nette ≥ seuil (défaut 1 €)
```

Le serveur mesure les distances **sur le réseau routier** (OSRM, un seul appel
`/table` par recherche, caché en SQLite) avec **repli haversine** automatique
(ADR-0005), choisit la station de référence (la plus proche) et injecte des
kilomètres déjà calculés — le module pur ne voit jamais de géométrie. L'hypothèse
affichée dit toujours quelle mesure a réellement servi. La
tendance (`domain/trend/`) est déterministe (moyenne, médiane, variations,
pondération par ancienneté). Les formulations restent probabilistes
(« tendance probable », « selon les données récentes »).

## Limites du MVP

- **Historique** : l'API officielle ne fournit que l'état courant ; la
  tendance est construite sur l'historique local accumulé par l'app (quelques
  jours suffisent).
- **Enseigne** : non publiée dans le flux officiel — affichée « si disponible »
  (souvent absente).
- **Détour** : mesuré sur la route (OSRM public, gratuit et sans clé), avec
  repli en ligne droite si le routage échoue — l'hypothèse affichée précise
  laquelle des deux a servi. Le **rayon** de recherche reste, lui, un cercle
  géographique (haversine) : ce n'est pas un budget de trajet.
- **Géocodage** : API Adresse de l'État (BAN) et Nominatim/OSM, avec cache
  SQLite. Un lieu choisi dans les suggestions fournit son centre : aucun
  second géocodage.
- **Favoris** : stockés localement (localStorage) ; la table serveur existe
  pour une évolution multi-appareils.

## Documentation

- `docs/specs/spec.md` — spécification complète
- `docs/specs/grill-decisions.md` — décisions bloquantes (D1–D6)
- `docs/research/fuel-data-source.md` — source officielle vérifiée
- `docs/adr/` — décisions d'architecture (0001–0005)
- `docs/tickets/` — tickets (001–022)
- `CONTEXT.md` — vocabulaire métier
- `PLAN.md` — plan d'exécution

## Licence des données

Source : « Prix des carburants en France - Flux quotidien », DGCCRF /
Ministères économiques et financiers, data.economie.gouv.fr, licence ouverte
(`fr-lo`).
