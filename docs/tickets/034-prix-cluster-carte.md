---
id: 034
titre: Le cluster de la carte affiche le meilleur prix de son groupe
statut: done
dependances: []
priorite: P2
estimation: S
---

# 034 — Un cluster ne doit pas obliger à zoomer pour savoir

**Ce que ça améliore :** un cluster n'affiche aujourd'hui qu'un **nombre**
(« 7 »). Sa couleur porte déjà le dégradé d'attractivité de sa station la moins
chère, mais aucun prix n'est lisible : il faut zoomer pour savoir si le groupe
vaut le détour. `pouvoirachatplus.fr` affiche un prix sur ses clusters
(agrégation `priceSum` / `priceCount`).

## Décision : le minimum, pas la moyenne

La comparaison initiale parlait de « prix moyen ». **Le minimum est retenu**,
pour deux raisons :

1. **Cohérence avec la couleur.** Le disque porte déjà l'attractivité de la
   station la **moins chère** du groupe (`attractiveness: Math.max(...)`,
   `app/utils/stationClusters.ts`). Afficher une moyenne à côté d'une couleur
   qui parle du minimum ferait dire deux choses différentes au même disque —
   l'utilisateur lirait le vert comme s'appliquant au nombre affiché.
2. **C'est la grandeur qui décide.** L'app répond « faut-il aller ailleurs ? ».
   Le meilleur prix du groupe est ce qui déclenche un détour ; la moyenne du
   groupe ne décide de rien.

Le libellé est donc **« dès X € »** — une promesse vraie, pas une synthèse.

## Fraîcheur

Le minimum ne retient que les prix **frais** (`isStale === false`, soit ≤ 24 h,
CONTEXT.md §Fraîcheur). Annoncer « dès 1,712 € » sur la base d'un prix de trois
jours serait exactement le genre de promesse que l'app refuse de faire. Si
aucune station du groupe n'a de prix frais, `minPrice` est `null` et le disque
n'affiche que son nombre — jamais un prix douteux.

## Décisions d'interface

- `StationCluster.minPrice: number | null` — prix le plus bas des membres
  **frais** du groupe ; `null` si aucun.
- Le module `stationClusters.ts` reste **pur et non formatant** : il expose un
  nombre. Le formatage (`formatMarkerPrice`, séparateur français, 3 décimales)
  reste dans `StationMap.vue`, comme pour les marqueurs individuels.
- Rendu : pilule sous le disque, via la classe **`.jflp-cluster-label`** qui
  existe déjà dans `StationMap.vue` (déjà stylée à cet effet, jusqu'ici
  inutilisée).
- Accessibilité (NFR-ACC-4 — la couleur n'est jamais le seul vecteur) : le nom
  accessible du marqueur devient « N stations regroupées, à partir de X €/L ».
  Sans prix frais : « N stations regroupées », inchangé.

## Critères de fin

- Un cluster de plusieurs stations fraîches affiche « dès » + le prix le plus
  bas du groupe.
- Une station périmée (> 24 h) ne peut pas fournir le prix affiché.
- Groupe entièrement périmé ⇒ aucun prix affiché, le nombre reste.
- Le nom accessible porte le prix quand il existe.
- TDD sur `buildStationClusters` (minimum, exclusion des périmés, groupe vide).
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e` verts.
