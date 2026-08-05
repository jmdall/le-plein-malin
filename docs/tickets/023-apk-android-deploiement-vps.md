---
id: 023
titre: APK Android (Capacitor) + déploiement backend sur VPS
statut: done
dependances:
  - "014"
priorite: P2
estimation: M
---

# 023 — APK Android (Capacitor) + déploiement backend sur VPS

**Ce que ça livre :** un **APK Android debug installable** (sideload), généré
automatiquement par GitHub Actions, qui sert l'app Nuxt dans une **WebView
Capacitor** et appelle l'API hébergée sur le **VPS**. À terme, le même pipeline
produira un **AAB signé pour le Play Store** (hors périmètre de ce ticket).

## Contexte

L'app est SSR (Nitro + SQLite, ticket 008). Un APK Capacitor embarque un
**build statique** (`nuxt generate` → `.output/public`) : il ne peut pas
embarquer le serveur Nitro ni la base. L'API reste donc **distante** :
- la base URL est injectée au build via `NUXT_PUBLIC_API_BASE`
  (`app/utils/api.ts`) ;
- l'APK pointe vers le backend hébergé sur le VPS (HTTPS) ;
- hors-ligne, la PWA affiche le shell statique explicite — jamais de prix périmé
  (cohérent avec NFR-PWA-3, ticket 014).

Le backend tourne sur le **VPS** avec le `Dockerfile`/`docker-compose.yml`
existants (Nitro + SQLite, volume `sqlite-data` persistant) — pas de migration
de base, pas de Postgres.

## Critères d'acceptation

- [x] Base URL de l'API configurable côté client : `NUXT_PUBLIC_API_BASE` lue
      dans `app/utils/api.ts` (`apiUrl()`), les 5 appels `/api/...` du client
      passent par elle ; base vide en dev/SSR (URL relatives, inchangé).
- [x] Capacitor 8.5 ajouté (`@capacitor/core|cli|android`), `capacitor.config.ts`
      (`appId fr.jmdall.lepleinmalin`, `webDir .output/public`,
      `androidScheme https`).
- [x] Job CI `apk` dans `.github/workflows/ci.yml` : `npm run generate` (avec
      `NUXT_PUBLIC_API_BASE` depuis `vars`), `npx cap add android`, `npx cap
      sync android`, `./gradlew assembleDebug`, `upload-artifact` de
      `app-debug.apk`. Le dossier `android/` est généré, non versionné.
- [x] **CI APK vert** : job `apk` passe (Java 21 requis par Capacitor 8,
      `invalid source release: 21` corrigé en dc11130). APK debug ~3,8 Mo
      publié dans l'onglet Actions (`le-plein-malin-debug.apk`).
- [x] **Backend déployé sur le VPS** : `docker compose up --build`, volume
      `sqlite-data` persistant, vars d'env (`DATABASE_PATH`, `SYNC_INTERVAL_HOURS`,
      `FUEL_PRICES_PROVIDER`), sous-domaine HTTPS (reverse proxy + Certbot) qui
      sert `/api/*`. Le dépôt est **public** : le script `deploy-vps.sh` clone
      en HTTPS (aucune clé SSH / deploy key requise sur le VPS). Build Docker
      corrigé : outils node-gyp (python3/make/g++) + `COPY .` avant `npm install`
      pour le type-check PWA (fdc69e4, 7d6c3a7).
- [x] `GET /api/health` répond depuis l'URL publique
      (`{"status":"ok","lastSync":...}`) → l'APK peut appeler l'API.
- [x] Un APK debug téléchargé depuis l'onglet Actions s'installe sur un Android
      (sideload) et affiche une recommandation (API VPS joignable). Build
      `31007646694` vert, `NUXT_PUBLIC_API_BASE=https://api.example.com`
      injecté, APK ~3,8 Mo publié en artifact.
- [x] `npm run lint && npm run typecheck && npm run test` passe.

## Hors périmètre (plus tard)

- **Play Store** : AAB signé, keystore en secret GitHub, `assembleRelease`,
  compte développeur Google ($25). Requiert la base URL en release.
- Synchronisation automatique des prix sur le VPS (le job Nitro tourne déjà
  toutes les 2 h par défaut — à confirmer en prod).

## Notes

- Le module natif `better-sqlite3` compile à chaque build (CI et VPS) via le
  `postinstall` npm — normal, juste plus lent.
- Décision : **SQLite + Droplet/VPS**, pas Postgres (une seule instance, ~150 Mo,
  faible trafic — voir discussion du 05/08). Postgres plus tard si multi-instances.
- Le `vars.NUXT_PUBLIC_API_BASE` du repo GitHub doit être défini avant que l'APK
  pointe sur la bonne API (sinon l'APK utilise des URL relatives → hors-ligne).
  **Défini** : `https://api.example.com` (2026-08-05).
- La sync manuelle (`POST /api/sync`) remplit `stations` mais n'écrit **pas**
  `last_sync` (réservé au job périodique) : `lastSync: null` dans `/api/health`
  est attendu jusqu'au prochain tick du job Nitro (toutes les 2 h).
