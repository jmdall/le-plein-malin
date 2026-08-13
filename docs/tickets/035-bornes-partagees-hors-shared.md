---
id: 035
titre: Les bornes partagées cassaient le build — sortir de shared/, réutiliser GeoPoint
statut: done
dependances: [031, 033]
priorite: P1
estimation: S
---

# 035 — `shared/` n'est pas un dossier ordinaire dans Nuxt 4

**Ce que ça corrige :** le ticket 031 a placé les bornes géographiques
partagées dans `shared/geo.ts`, importé en relatif depuis `app/utils/location.ts`
(`'../../shared/geo'`). Lint, typecheck, 414 tests unitaires et 16 e2e étaient
verts — mais **le build de production échouait** :

```
[nitro] ERROR RollupError: Could not resolve "../../../../../shared/geo.ts"
  from "node_modules/.cache/nuxt/.nuxt/dist/server/_nuxt/BrandBadge-Cg7jRNmi.js"
```

Deux jobs CI sur trois sont tombés : « Build de production (Nitro + PWA) »
(`npm run build`) et « APK Android » (`npm run generate`).

## Cause

`shared/` est un dossier **spécial** de Nuxt 4 : son contenu est auto-importé et
ses imports sont réécrits (noter le `.ts` ajouté dans le specifier, et le chemin
recalculé depuis le répertoire de sortie du bundle). Un import relatif d'un
fichier de `app/` vers `shared/` traverse cette réécriture et devient
irrésolvable pour Vite/Rollup.

Ce n'est **pas** le fait de sortir de `srcDir` qui pose problème :
`app/utils/stationClusters.ts` importe déjà
`'../../domain/fuel-prices/haversine'` et se bundle très bien. C'est le
traitement propre à `shared/`.

## Correctif

1. Le module vit désormais dans **`domain/fuel-prices/searchBounds.ts`** — le
   chemin déjà éprouvé dans les deux sens (app et server). Son contenu est du
   domaine pur : des bornes géographiques et un prédicat, sans dépendance.
2. Il réutilise **`GeoPoint`** (`domain/fuel-prices/types.ts`) au lieu du
   `LatLon` introduit par le ticket 033. Ce `LatLon` était un **troisième**
   doublon du même concept (`GeoPoint`, `GeoPosition`, `LatLon`) — la revue de
   code du ticket 031 avait déjà signalé le doublon, ce correctif le solde pour
   toute la couche serveur (`routeDistance.ts`, `station-distances.ts`).
3. `shared/` ne contient plus que `types/sax.d.ts` (déclaration de types, pas de
   code importé).

Aucun changement de comportement : mêmes bornes, mêmes valeurs, mêmes tests.

## Leçon (à appliquer aux prochains chantiers)

`lint` + `typecheck` + `test` + `test:e2e` **ne suffisent pas** : `npm run build`
et `npm run generate` sont deux portes indépendantes que la CI franchit et que
ces quatre commandes ne couvrent pas. Le `README.md` §Tests liste bien
`npm run build` — il n'avait pas été lancé.

Les critères de fin d'un ticket touchant à la résolution de modules doivent
inclure les deux.

## Critères de fin

- `npm run build` sort en 0.
- `npm run generate` sort en 0 (chemin APK).
- Plus aucune référence à `shared/geo` dans le code ni la doc.
- `LatLon` n'existe plus : `GeoPoint` partout côté serveur.
- `npm run lint`, `npm run typecheck`, `npm run test` (418), `npm run test:e2e`
  (16) verts.
