# PLAN — « Je fais le plein ou non ? »

Application web mobile-first qui aide un automobiliste en France à décider où et
quand faire le plein, à partir des prix officiels des carburants.

## Contexte

- Cahier des charges : `CAHIER-DES-CHARGES.md`
- Source de données vérifiée : `docs/research/fuel-data-source.md`
- Stack cible : Nuxt 3, Vue 3, TypeScript strict, Nitro, SQLite, Drizzle ORM,
  Zod, Vitest, Playwright, ESLint, Docker, PWA.
- Modèle OpenCode obligatoire : `deepseek/deepseek-v4-flash` (API officielle
  DeepSeek, `https://api.deepseek.com/v1`).
- Skills : `.agents/skills/` (Matt Pocock), config dépôt dans `docs/agents/`.

## Principes d'exécution

- Petites tranches verticales ; la logique de recommandation est un module
  métier **pur** (`calculateFuelRecommendation`), sans dépendance Nuxt/HTTP/SQLite/env.
- TDD obligatoire pour toute règle métier.
- Commits locaux petits et cohérents, pas de push, pas de PR.
- Aucun prix inventé : toute donnée provient de la source officielle ou du cache.

## Phases

### Phase 0 — Configuration (faite)
- [x] Vérifier OpenCode + modèle DeepSeek V4 Flash (`opencode run` smoke test OK)
- [x] Installer les skills Matt Pocock (`.agents/skills/`, 11 skills requis)
- [x] Configurer le dépôt (`docs/agents/`, AGENTS.md, opencode.json)
- [x] Recherche de la source officielle (`docs/research/fuel-data-source.md`)

### Phase 1 — Décisions & spécification
- [ ] Grill (questions bloquantes uniquement) → `docs/specs/grill-decisions.md`
- [ ] Spécification → `docs/specs/spec.md`
- [ ] Découpage en tickets → `docs/tickets/`
- [ ] `CONTEXT.md` (vocabulaire métier) + ADR structurants

### Phase 2 — Mise en place du projet
- [ ] Scaffold Nuxt 3 + TypeScript strict + ESLint + Vitest + Playwright + PWA
- [ ] Drizzle ORM + SQLite (schéma initial)
- [ ] `.env.example`, `docker-compose.yml`

### Phase 3 — Domaine métier (TDD)
- [ ] `domain/fuel-prices` (types, valeurs, fraîcheur)
- [ ] `domain/recommendation` (détour, économie brute/net, seuil, recommandation)
- [ ] `domain/stations` (sélection de la station candidate)
- [ ] `domain/vehicle` (profil véhicule, capacité, quantité)
- [ ] `domain/trend` (moyenne, médiane, variation 24 h/7 j, tendance, score de fraîcheur)
- Tests couvrant les 18 scénarios du §13 du cahier des charges.

### Phase 4 — Provider & persistance
- [ ] `FuelPriceProvider` (abstraction) + implémentation Opendatasoft
- [ ] Cache SQLite + job de synchronisation (Nitro)
- [ ] Repli roulez-eco.fr

### Phase 5 — API & interface
- [ ] API Nitro (`/api/stations`, `/api/recommendation`, `/api/history`…)
- [ ] Pages : accueil (recommandation), liste, carte OSM, favoris, historique,
      profil véhicule, paramètres, mode sombre, PWA
- [ ] États de chargement / erreurs, accessibilité, responsive

### Phase 6 — Tests e2e & validation
- [ ] Tests Playwright (parcours principal)
- [ ] `npm run lint && npm run typecheck && npm run test && npm run test:e2e && npm run build`
- [ ] Revue de code (`/code-review`) + corrections + relance validation

### Phase 7 — Rapport final
- [ ] README.md complet
- [ ] Rapport final (fonctionnalités, architecture, source, modèle, skills,
      commits, résultats exacts des tests/build, limites, suites)

## Risques / points d'attention

- Le dataset API n'expose que l'état courant → historique construit localement
  (ADR-0002).
- Pas de champ enseigne dans le flux → affiché « si disponible » (souvent absent).
- Le volume (73 493 enregistrements) impose une synchronisation paginée ou par
  export complet, jamais un fetch par station.
- Pi : Docker rootless → utiliser `sudo env -u DOCKER_HOST docker …` si besoin.
