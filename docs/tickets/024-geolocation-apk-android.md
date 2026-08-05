---
id: 024
titre: Géolocalisation APK Android (Capacitor)
statut: done
dependances:
  - "023"
priorite: P1
estimation: S
---

# 024 — Géolocalisation APK Android (Capacitor)

**Ce que ça livre :** la géolocalisation fonctionne sur l'APK Android
(`fr.jmdall.lepleinmalin`). En WebView Capacitor, `navigator.geolocation` est
**inutilisable** : il renvoie systématiquement `PERMISSION_DENIED` sans jamais
afficher la boîte de permission système. L'app passe donc par le bridge natif
**`@capacitor/geolocation`** (version majeure alignée Capacitor 8).

## Critères d'acceptation

- [x] `@capacitor/geolocation@^8.2.0` ajouté au `package.json`.
- [x] Sur l'APK, « Utiliser ma position » déclenche la permission **native**
      Android (dialog système), puis `getCurrentPosition` — plus jamais
      « Vous avez refusé la géolocalisation. » tant que l'utilisateur n'a pas
      réellement refusé.
- [x] Le web (navigateur / dev) continue d'utiliser `navigator.geolocation`
      (comportement inchangé).
- [x] Repli propre si la permission est réellement refusée : état `denied`
      conservé (LOC-1), recherche ville/CP toujours disponible.
- [x] `npm run lint && npm run typecheck && npm run test` passe.

## Cause racine

`requestGeolocation()` (app/utils/location.ts) utilisait
`navigator.geolocation.getCurrentPosition`. Dans la WebView Capacitor, ce
callback n'est **jamais** déclenché avec une position : le
`BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` demande bien les
permissions système, mais si elles ne sont pas accordées (ou non déclarées),
il invoque le callback `denied` → l'app affichait systématiquement
« Vous avez refusé la géolocalisation. ».

## Solution

### 1. Bridge natif (app/utils/location.ts, app/composables/useGeolocation.ts)

- `requestGeolocation()` importe dynamiquement `@capacitor/core` et, si
  `Capacitor.isNativePlatform()`, enregistre le plugin `Geolocation`
  (`registerPlugin`) puis `requestPermissions()` → `getCurrentPosition()`.
  Sinon, repli sur l'API navigateur. L'import dynamique garde le module
  purement navigateur/test — aucune dépendance Capacitor au chargement.
- `useGeolocation.request()` n'appelle plus `isGeoAvailable()` en garde-fou :
  ce check (présence de `navigator.geolocation`) est justement faux côté
  WebView (l'API existe mais est cassée). La disponibilité est tranchée dans
  `requestGeolocation()` elle-même.
- Le résultat de `requestPermissions` (`location` / `coarseLocation`) est
  traduit en `denied` si ni l'une ni l'autre n'est `granted`.

### 2. Déclaration des permissions Android

Le plugin `@capacitor/geolocation` ne déclare **pas** les permissions dans son
propre `AndroidManifest.xml` ; le README officiel demande de les ajouter au
manifest de l'app. Or le dossier `android/` est **non versionné** et régénéré
par `npx cap add android` à chaque build. Sans déclaration,
`Bridge.validatePermissions` rejette la requête avec
« Missing the following permissions in AndroidManifest.xml » et la
géolocalisation reste cassée même via le bridge natif.

Fix : script idempotent `scripts/android-manifest-permissions.sh` qui injecte
`ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` dans
`android/app/src/main/AndroidManifest.xml`, appelé en CI juste après
`npx cap sync android` (`.github/workflows/ci.yml`, étape
« Déclarer les permissions de géolocalisation »). La fusion des manifests se
fait ensuite au build Gradle ; aucun plugin Gradle de merge n'est requis.

## Tests

- `tests/unit/geolocation.spec.ts` — chemin navigateur : position OK,
  PERMISSION_DENIED → denied, absence navigateur → erreur claire.
- `tests/unit/geolocation-native.spec.ts` — chemin natif (mock statique de
  `@capacitor/core`) : position OK, permission refusée → denied, `coarseLocation`
  suffisant, échec du bridge → erreur sans rejet non géré.
- `vitest.config.ts` : `server.deps.inline: ['@capacitor/core']` pour pouvoir
  mocker le paquet node_modules.

## Vérification

- CI : `npm run generate` → `cap add android` → `cap sync android` →
  `bash scripts/android-manifest-permissions.sh` → `./gradlew assembleDebug`.
  Vérifier que `app-debug.apk` contient bien les 2 permissions :
  `aapt dump permissions app-debug.apk`.
- APK : installer, « Utiliser ma position » → dialog système → recommandation.
- Web : `npm run dev`, « Utiliser ma position » → prompt navigateur inchangé.
