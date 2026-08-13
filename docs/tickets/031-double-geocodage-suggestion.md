---
id: 031
titre: Supprimer le double géocodage — la suggestion choisie porte son centre
statut: done
dependances: []
priorite: P1
estimation: M
---

# 031 — La station de référence doit être celle du point choisi

**Ce que ça corrige :** quand l'utilisateur choisit une suggestion dans
l'autocomplete, le centre de la recherche n'est pas le point qu'il a choisi.

Enchaînement actuel :

1. `app/utils/autocomplete.ts` interroge le BAN (`api-adresse.data.gouv.fr`).
   La réponse GeoJSON contient `geometry.coordinates` — le centroïde exact de
   la suggestion.
2. `parseFeature` **jette** cette géométrie (`AutocompleteSuggestion` n'a pas
   de position, par choix du ticket 025).
3. `buildSearchQuery` reconstruit une chaîne de texte (« Paris 75001 »).
4. `server/lib/geocode.ts` géocode ce texte **une deuxième fois**, avec
   Nominatim (BAN seulement en repli).

Conséquences :

- **Nominatim et le BAN ne renvoient pas le même centroïde** pour la même
  commune. Le centre du rayon, donc la **station de référence**, donc
  l'**économie nette** de chaque **station candidate**, sont calculés autour
  d'un point que l'utilisateur n'a pas choisi.
- Un appel réseau externe inutile par recherche (et jusqu'à 8 s d'attente
  quand Nominatim répond 403 — `timeoutMs: 8_000`, cas fréquent en datacenter
  comme le note déjà `server/lib/geocode.ts` ligne 7).
- Deux fournisseurs de géocodage pour une seule action utilisateur.

**Périmètre :** ~~client uniquement~~ — **corrigé pendant la revue de code**.
`/api/stations` et `/api/recommendation` acceptent déjà `lat`/`lon`, mais deux
défauts sont apparus une fois la revue passée dessus. Voir « Corrections issues
de la revue » en bas : le ticket touche finalement aussi
`server/lib/validation.ts` et `server/lib/station-mapping.ts`.

## Objectif

1. `AutocompleteSuggestion` porte `position: { lat, lon } | null` — le
   centroïde du BAN pour cette suggestion. `null` quand la géométrie est
   absente ou invalide : on n'invente jamais une position.
2. La sélection d'une suggestion envoie `lat`/`lon` directement à l'API. Le
   géocodage serveur ne sert plus que pour une **saisie libre** (submit sans
   suggestion) et pour le rejeu au montage.
3. Le texte mémorisé localement est inchangé (« ville CP »). Aucune coordonnée
   n'est persistée.

## Décisions d'interface

- `AutocompleteSuggestion.position: { lat: number; lon: number } | null`
  - source : `feature.geometry.coordinates = [lon, lat]` (ordre GeoJSON) ;
  - rejeté si non fini, ou hors bornes (`lat` ∉ [-90, 90], `lon` ∉ [-180, 180]).
- `buildLocationSelection(suggestion, input): LocationSelection` dans
  `app/utils/autocomplete.ts`
  - `LocationSelection = { query: string; position: { lat, lon } | null }` ;
  - `query` reste exactement la sortie actuelle de `buildSearchQuery`
    (affichage, mémorisation, repli de géocodage) — comportement inchangé ;
  - `position` est celle de la suggestion, ou `null`.
- `LocationSearch` : l'événement `@search` passe de `[query: string]` à
  `[selection: LocationSelection]`. Le submit texte libre émet
  `{ query, position: null }` — le parcours sans JS et sans suggestion est
  strictement inchangé.
- `resolveSearchInput(input, position): ResolvedSearch | null` dans
  `app/utils/location.ts` — **fonction pure**, sort la branche de décision de
  `pages/index.vue` :
  - `null` si l'entrée est vide (aucune recherche lancée) ;
  - `target` : `{ lat, lon }` si une position est fournie, sinon
    `{ postalCode }` si l'entrée est 5 chiffres, sinon `{ q }` ;
  - `saved` : `{ source: 'postalCode' | 'city', q }` — **jamais** de
    coordonnées (LOC-4) ;
  - `label` : le texte, pour « Recherche autour de … ».

## Invariants respectés

- **LOC-4** : la position précise de l'utilisateur n'est ni transmise ici ni
  persistée. Le centroïde d'une commune choisie explicitement dans une liste
  n'est pas la position de l'utilisateur, et il n'est pas stocké.
- **Aucune donnée inventée** : une géométrie absente ou invalide donne
  `position: null`, pas une position devinée.
- **REC-2/D1** : l'UI ne recalcule aucune règle métier. Elle transmet
  seulement un centre plus juste.

## Critères de fin

- `parseAutocompleteResponse` renvoie la position de chaque suggestion, et
  `null` pour une géométrie absente / non numérique / hors bornes.
- Choisir une suggestion appelle `/api/stations` et `/api/recommendation` avec
  `lat`/`lon` — jamais `q` ni `postalCode`.
- Une saisie libre (submit) garde le comportement actuel : `postalCode` si 5
  chiffres, sinon `q`.
- Le rejeu au montage (`readSavedLocation`) fonctionne inchangé, sans
  coordonnée en base locale.
- TDD : `parseAutocompleteResponse`, `buildLocationSelection` et
  `resolveSearchInput` sont testés avant implémentation.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e` verts.

## Corrections issues de la revue (`/code-review`)

Deux défauts que le périmètre « client uniquement » cachait. Les deux sont
corrigés dans ce ticket.

### 1. Un lieu choisi ne doit pas se faire passer pour une géolocalisation

`resolveCenter` renvoyait `mode: 'geo'` pour n'importe quel `lat`/`lon`, et
`recommendation-input.ts` en déduit `hasGeoLocation: true`. Dans
`domain/recommendation/calculate.ts`, cela désarme `isPartial` **et supprime**
l'hypothèse « Détour estimé en ligne droite … (absence de géolocalisation) ».

Envoyer le centroïde d'une commune rendait donc la recommandation **moins
prudente** qu'avant, sans que la donnée le justifie — l'utilisateur n'est pas
à ce point. Cela contredit le **niveau de confiance** de `CONTEXT.md`.

Correctif : la requête porte la provenance des coordonnées.

- `positionSource` ∈ {`device`, `place`}, **défaut `device`** — la
  géolocalisation et le déplacement de carte gardent leur comportement.
- `ResolvedCenter` gagne un mode `place`. `hasGeoLocation: center.mode === 'geo'`
  est inchangé et devient correct de lui-même.
- `buildSearchParams` n'émet le paramètre que pour `place` (le défaut serveur
  suffit), et `stationsRequest` le transmet aussi — sinon les deux endpoints
  résoudraient le même centre avec deux provenances différentes.

### 2. Bornes client / serveur désaccordées → 400 en outre-mer

`baseLocationSchema` borne `lat`/`lon` à la France métropolitaine (41..51,5 /
-5,5..9,8, spec §14 #14). Le BAN, lui, couvre l'outre-mer. Une suggestion à La
Réunion ou en Guadeloupe passait le filtre client (bornes terrestres) et se
faisait **rejeter en 400** — alors que l'ancien chemin par texte fonctionnait.

Correctif : `shared/geo.ts` porte les bornes une seule fois, consommées par le
schéma Zod **et** par `resolveSearchInput`. Hors bornes ⇒ repli sur le texte,
donc exactement le comportement d'avant le ticket. Deux questions distinctes,
deux gardes, aucune duplication :

- `parseSuggestionPosition` : « cette coordonnée est-elle valide ? » → bornes
  terrestres ;
- `resolveSearchInput` : « peut-on chercher ici ? » → bornes API.

## Suite

Le déplacement de carte avait le même défaut de provenance que le point 1
(défaut préexistant à ce ticket). Tranché et corrigé dans le **ticket 032**.
