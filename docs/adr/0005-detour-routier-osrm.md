# ADR-0005 : Détour routier via OSRM (révise D3)

- **Date** : 2026-08-13
- **Statut** : Accepté
- **Révise** : D3 (`docs/specs/grill-decisions.md`) — « aucun routage routier
  n'est utilisé dans le MVP ». D3 était explicitement marquée *réversible*.
- **Ne révise pas** : ADR-0002/D2. La **formule** du détour
  (`max(0, dist_c − dist_r) × 2`) est inchangée ; seule la **mesure** des
  distances change.

## Décision

Les distances centre → station sont mesurées sur le **réseau routier** (OSRM,
service `/table`), avec **repli automatique sur haversine**. Le module de
recommandation reste pur : il reçoit toujours des kilomètres déjà calculés
(D3 inchangée sur ce point).

- Fournisseur : `RouteDistanceProvider`, une seule méthode
  `tableFromOrigin(origin, destinations)`.
- Implémentation : OSRM public (`router.project-osrm.org`), **gratuit et sans
  clé** — conforme au §11 (aucun service payant).
- **Un seul appel HTTP par recherche** : le service `/table` renvoie la matrice
  centre → toutes les candidates. Pas de N+1.
- Cache SQLite par couple (origine, destination) arrondi à 3 décimales
  (~110 m), TTL 30 jours : le réseau routier ne bouge pas.
- Repli : indisponibilité, timeout, `code != Ok`, destination sans route →
  haversine pour la (ou les) distance(s) manquante(s).

## Contexte

Le détour en ligne droite **sous-estime systématiquement** le coût du détour :
une station à 3 km à vol d'oiseau est souvent à 4-5 km par la route. L'
**économie nette** — la grandeur qui décide — était donc surestimée, et la règle
`économie nette >= seuil` déclenchait des détours non rentables en réalité.

C'était la limite du MVP la plus visible (`README.md`, « Limites du MVP »).

Mesure réelle, deux stations autour de Paris centre (48,8566 / 2,3522), via
`GET /table/v1/driving/…?sources=0&annotations=distance` :

| Destination | Ligne droite | Par la route | Écart |
|---|---|---|---|
| 48,87 / 2,36 | 1,60 km | 2,74 km | **+71 %** |
| 48,85 / 2,34 | 1,16 km | 1,59 km | **+37 %** |

Le détour étant un aller-retour, l'erreur est doublée dans le **coût du
détour**. Sur ces deux exemples, l'**économie nette** était donc surestimée de
l'équivalent de 1,1 à 2,3 km de carburant.

## Options considérées

1. **OSRM public + cache + repli haversine** (retenue). Gratuit, sans clé, un
   appel par recherche. Réserve assumée : la politique d'usage du serveur de
   démo mentionne « développement et test ». Le cache et le batch `/table`
   maintiennent un volume très faible, et le seam permet de basculer vers une
   instance auto-hébergée par variable d'environnement.
2. **OSRM auto-hébergé.** Aucune réserve de politique, mais le préprocessing
   MLD de l'extrait France demande plusieurs Go de RAM et le service 2-4 Go :
   incompatible avec le Droplet actuel (~150 Mo pour l'app, ticket 023) sans
   coût supplémentaire. Reste atteignable sans changer le code : `OSRM_BASE_URL`.
3. **Facteur de correction sur haversine** (×1,3). Aucune dépendance, mais reste
   une approximation grossière : ne distingue ni les fleuves, ni les autoroutes,
   ni les sens uniques.
4. **ORS / GraphHopper avec clé et quota.** Introduit une clé à gérer et un
   quota journalier qui peut bloquer l'app.

## Conséquences

- **Le rayon de recherche reste haversine.** Le provider filtre les stations
  dans un cercle géographique ; on route ensuite les survivantes. Une station à
  9,8 km à vol d'oiseau et 14 km par la route reste donc dans le rayon 10 km.
  On ne re-filtre **pas** sur la distance routière : le rayon est une zone, pas
  un budget de trajet.
- **La distance affichée devient routière** quand le routage réussit — plus
  proche de ce que l'automobiliste vivra.
- **La station de référence** (la plus proche) est choisie sur la distance
  routière : c'est bien celle où l'utilisateur ferait son plein par défaut.
- `FuelRecommendationInput` gagne `detourSource?: 'road' | 'straight-line'`
  (défaut `straight-line`). L'hypothèse affichée dit la vérité sur la mesure
  employée — l'app ne prétend jamais router quand elle a replié.
- **Latence** : un appel OSRM par recherche non cachée (~200-500 ms), timeout
  court, repli immédiat. Jamais bloquant.
- `detourSource` est indépendant de `hasGeoLocation` : router correctement ne
  dit pas où se trouve l'utilisateur. Une recherche ville/CP reste partielle.
