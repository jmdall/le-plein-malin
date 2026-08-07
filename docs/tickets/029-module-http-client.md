---
id: 029
titre: Module HTTP client unique (apiFetch) — dédupliquer useStations et useFuelRecommendation
statut: ready-for-agent
dependances: []
priorite: P2
estimation: M
---

# 029 — Un module HTTP client profond, plus de transport dupliqué

**Ce que ça livre :** `app/composables/useStations.ts` (143 l.) et
`app/composables/useFuelRecommendation.ts` (137 l.) sont des jumeaux : même
construction des params `URLSearchParams` (lat/lon/postalCode/city/q + radius +
fuel), mêmes messages d'erreur français, même garde anti-race `myToken !== token`,
même parsing de la réponse. ~90 lignes identiques dupliquées. Le module
`app/utils/api.ts` ne résout aujourd'hui que la base URL — il n'encapsule ni le
transport, ni l'erreur, ni la race.

**Bloqué par :** chantiers 1-3 (faits). Périmètre : client uniquement, aucun
changement serveur.

**Statut :** ready-for-agent

## Objectif

1. `app/utils/api.ts` devient un module HTTP profond : `apiFetch(path, params, { isStale })`
   encapsule fetch + erreur normalisée (messages français) + parsing JSON, retourne
   `Promise<{ ok: true; data: T } | { ok: false; error: string }>`.
2. `buildSearchParams(request)` (fonction pure) dans `app/utils/stations.ts`
   construit les params communs, consommée par les deux composables.
3. `useStations` et `useFuelRecommendation` ne gardent que leur machine d'état
   (status/data/error/token) et appellent `apiFetch`. **La différence de portée
   d'état est préservée** : stations = singleton (module-level), reco = par instance.
4. Aucun changement de comportement : mêmes URLs, mêmes erreurs, mêmes statuts.

## Décisions d'interface (validées par grilling)

- `apiFetch<T>(path, params, { isStale }) : Promise<{ ok: true; data: T } | { ok: false; error: string }>`
  - `path` : chemin API (ex. `/api/stations`)
  - `params` : `URLSearchParams` (déjà construit par `buildSearchParams`)
  - `isStale?: () => boolean` : si fourni, le fetch s'interrompt (retourne
    `{ ok: false, error: 'stale' }` ou `null`) quand la requête n'est plus la plus
    récente. Le composable vérifie après l'await.
  - Messages d'erreur EXACTS actuels : « Impossible de joindre le serveur.
    Vérifiez votre connexion. » (réseau), « Le serveur a renvoyé une erreur. »
    (non-ok sans corps), le message de `body.error.message` (non-ok avec corps),
    « Le serveur a renvoyé une réponse invalide. » (JSON invalide).
- `buildSearchParams(request: { lat?; lon?; postalCode?; city?; q?; radius; fuel }) : URLSearchParams`
  - Priorité : lat/lon SI les deux présents → sinon postalCode → sinon city →
    sinon q. Puis `radius`, `fuel` (via `fuelToApi`).
  - Vit dans `app/utils/stations.ts` (déjà `StationsRequest = Omit<RecommendationRequest, 'vehicleProfile'>`).
- Portée d'état : inchangée (singleton pour useStations, par instance pour
  useFuelRecommendation).

## Critères de fin

- `rg "fetch("` dans `app/` : aucun résultat hors `api.ts` (le seul fetch est dans apiFetch).
- `useStations.ts` et `useFuelRecommendation.ts` : chaque `refresh` appelle
  `apiFetch`, pas de `URLSearchParams` ni de `fetch` direct.
- Les messages d'erreur restent identiques (tests existants verts).
- `npm run typecheck`, `npm run lint`, `npm run test` verts (tests unitaires des
  deux composables passent inchangés).
- TDD : `buildSearchParams` est testé ; `apiFetch` est testé (stub fetch) pour
  les cas réseau / non-ok / JSON invalide / isStale.
