# Décisions bloquantes — « Je fais le plein ou non ? »

> Produit par `/grill-with-docs`. Le cahier des charges tranche déjà l'essentiel :
> seules les décisions **réellement bloquantes** (dont le choix change la structure
> du produit) sont listées ci-dessous, avec un défaut raisonnable documenté.
> Aucune question interactive : chaque option retenue est immédiatement
> actionnable et est choisie pour être **réversible**.
>
> Date : 2026-08-03. Source du contexte : `CAHIER-DES-CHARGES.md`,
> `docs/research/fuel-data-source.md`, `CONTEXT.md`, `PLAN.md`.

## Contexte

L'application aide un automobiliste en France à choisir entre **faire le plein
maintenant**, **mettre seulement X litres**, **attendre**, ou **aller dans une
autre station moins chère**, avec une recommandation explicable fondée sur les
prix officiels (DGCCRF), leur fraîcheur, la géographie locale et le profil du
véhicule.

Points structurants déjà fixés par le cahier des charges :

- Logique de recommandation **pure et déterministe** (`calculateFuelRecommendation`),
  sans LLM/ML, testable en TDD.
- Formules d'économie brute / nette / coût du détour **fixées** (défaut du
  seuil de rentabilité : **1 €**).
- Règles de fraîcheur **fixées** (24 h / 48 h).
- Source officielle **fixée** (DGCCRF via data.economie.gouv.fr).
- Stack cible, architecture `domain/` / `server/`, PWA, carto OSM.
- Recommandation = module métier pur, hors de l'UI.

## Décisions bloquantes

### D1 — Format de la recommandation du module métier

**Problème.** `calculateFuelRecommendation` doit renvoyer un résultat exploitable
par l'API, la page principale et le panneau « Voir le calcul ». La forme exacte
de ce retour conditionne l'interface du module pur, donc tous les consommateurs.
Il faut aussi savoir comment émettre une **recommandation partielle** sans que
cela soit confondu avec une recommandation complète (confiance réduite).

**Option recommandée.** Renvoyer un objet immuable et complet :

```ts
interface FuelRecommendation {
  type: 'fill-now' | 'partial-fill' | 'wait' | 'go-to-station' | 'insufficient-data'
  confidence: number            // 0..1
  quantityToBuy: number | null  // litres, pour partial-fill
  recommendedStation: StationPrice | null
  referenceStation: StationPrice | null
  detourCost: number | null
  grossSavings: number | null
  netSavings: number | null
  reasons: string[]            // raisons principales
  usedData: string[]           // données utilisées
  ignoredData: string[]        // données ignorées
  calculations: string[]       // calculs effectués
  assumptions: string[]        // hypothèses
  freshness: FreshnessInfo     // âge + score de fraîcheur
  isPartial: boolean           // recommandation partielle (confiance réduite)
}
```

Un seul type, discriminé par `type`, avec tous les champs explicatifs demandés
au §8. `isPartial` est explicite pour que l'UI n'ait pas à inférer la partialité
à partir de la confiance.

**Justification.** Un type unique discriminé est simple, testable et couvre
toutes les recommandations du §8. Les champs explicatifs font partie du contrat
métier (le cahier des charges demande de les afficher), donc les exposer dans le
retour évite au serveur de re-calculer ou de re-deviser une logique déjà pure.

**Réversibilité.** **Réversible.** La forme du retour n'engage que le module pur ;
ajouter un champ (ex. `hint` pour l'UX) ne casse pas le calcul.

---

### D2 — Défaut de la distance supplémentaire (détour) sans géolocalisation

**Problème.** Le cahier des charges (§7) exige que le détour soit « le détour
réel, pas seulement la distance entre l'utilisateur et la station ». Mais sans
géolocalisation (recherche par ville/code postal), on ne connaît que le centre
du rayon. La définition exacte de la distance de référence détermine la valeur
des économies nettes — donc le cœur du produit.

**Option recommandée.** Définir la **station de référence** comme la station
**la plus proche** du centre du rayon de recherche ; le détour est alors la
**distance aller-retour supplémentaire** par rapport à cette station de
référence : `max(0, dist_centre→candidate − dist_centre→ref) × 2`. Le facteur
aller-retour est appliqué **une seule fois**, à la différence (pas à chaque
distance). On borne le détour à `≥ 0` (une candidate sur le trajet n'est jamais
pénalisée). Le détail est documenté dans le §4 de la spec, le seuil de
rentabilité (défaut 1 €) ne change pas.

**Justification.** C'est la seule définition réalisable sans géolocalisation qui
satisfait l'exigence « détour réel » : comparer à la station la plus proche au
lieu de chaque point. Le facteur aller-retour sur la différence est cohérent avec
la formule du §7 (distance supplémentaire A/R). Sans cette décision, les
économies nettes seraient arbitraires, donc la recommandation invalide.

**Réversibilité.** **Réversible dans le produit** (le choix d'un autre point de
référence — ex. moyenne du rayon — ne change que les nombres, pas la structure),
mais **structurant pour le module pur** : ce choix définit la forme des données
d'entrée (`FuelRecommendationInput`), dont l'évolution est coûteuse. Décision à
poser **avant** la rédaction de la spec et du schéma SQLite.

---

### D3 — Données d'entrée du module : qui calcule les distances ?

**Problème.** La recommandation étant un module **pur**, elle ne peut pas
résoudre la distance candidat → référence (donnée dérivée de la géométrie). Il
faut décider où vit cette résolution, sans casser la pureté du module.

**Option recommandée.** Le module reçoit des **distances déjà calculées** (en
km) et ne calcule jamais de géométrie. Les distances (utilisateur → station,
candidat → référence) sont calculées **côté serveur** (API Nitro) à l'aide d'une
fonction haversine pure stockée dans `domain/fuel-prices` (sans HTTP ni Nuxt),
et **aucun routage routier n'est utilisé dans le MVP** (pas de service payant,
conformément au §11).

```ts
interface FuelRecommendationInput {
  fuelType: FuelType
  quantityToBuy: number          // litres
  vehicle: VehicleProfile        // conso L/100km, capacité, niveau
  referenceStation: StationPrice
  candidates: CandidateWithDistance[]  // prix + distanceAvecReference en km
  // + params : seuil (défaut 1 €), heures seuils fraîcheur (24/48)
}
```

**Justification.** Séparation des responsabilités : la géométrie est résolue
hors du module (qui reste pur), la distance est fournie en entrée. La haversine
est la norme pour l'approximation E-W en court rayon ; le cahier des charges
interdit les services payants, donc le routage est exclu et l'approximation
documentée comme hypothèse affichée à l'utilisateur (le §8 exige de montrer les
hypothèses).

**Réversibilité.** **Réversible.** Si un jour un service de routage gratuit est
utilisé, seule la couche serveur change (la distance entre en entrée du module,
rien ne change dedans).

---

### D4 — Historique local : granularité temporelle et première synchronisation

**Problème.** La tendance (§9) exige un historique, que l'API DGCCRF ne fournit
pas (état courant uniquement) : il faut l'accumuler localement. Deux sous-choix :
quelle **résolution temporelle** pour les observations (stockage des snapshots),
et que fait-on tant qu'il n'y a pas d'historique ?

**Option recommandée.**

- **Granularité : snapshot quotidien par station × carburant.** Une seule ligne
  par `(station_id, fuel_type, jour)` dans `price_history`, upsertée à chaque
  synchronisation du jour. Résolution **quotidienne**, cohérente avec la
  fréquence observée de la source (les prix ne bougent que quelques fois par
  jour).
- **Tendance : variation sur 24 h et 7 j** calculées sur cet historique local
  (comparaison à J−1 et J−7), selon la fenêtre demandée au §9. Si moins de 2
  points de comparaison existent, retourner « Données insuffisantes » pour la
  tendance (mais continuer sur les prix locaux courants, cf. §9).
- Le `score de fraîcheur` découle des règles 24 h / 48 h (déjà tranchées).

**Justification.** Le snapshot quotidien est la granularité minimale suffisante
pour une variation 24 h / 7 j, la plus simple à upsert sans explosion de volume
(73 k enregistrements × 1 ligne/jour station-carburant ≈ 1,8 M lignes/an en
France — correct en SQLite). L'état vide (démarrage) est géré par la
recommandation partielle (D1), déjà prévue au §9 du cahier des charges.

**Réversibilité.** **Réversible.** Une granularité plus fine (horaire) serait un
ajout ; une agrégation plus grossière (hebdo) serait une simplification. Le
schéma SQLite évolue, mais pas l'interface du module.

---

### D5 — Comment choisir le « mettre seulement X litres » (recommandation partielle de remplissage)

**Problème.** La recommandation « **Mets seulement X litres** » implique de
choisir une **quantité**. Or l'utilisateur peut saisir une quantité souhaitée
(§6) ou rien (quantité libre). Il faut définir la valeur de `X` quand elle n'est
pas fournie.

**Option recommandée.** Lorsque la quantité n'est pas précisée :
`X = min(quantité pour rentabiliser le détour, volume disponible dans le réservoir)`.
Concrètement : le module calcule la quantité minimale qui rendrait le détour
rentable (`seuil / différence de prix au litre`), arrondi au litre supérieur,
borné par le volume disponible du réservoir (`capacité − niveau`) et, si besoin,
par la quantité souhaitée. Si même le plein complet ne rentabilise pas le détour
→ recommandation « **Tu peux attendre** » ou « **Fais le plein maintenant** »
selon le niveau de réservoir et la tendance.

**Justification.** C'est la lecture la plus utile de la recommandation : si le
détour n'est rentable qu'au-delà d'une certaine quantité, dire « mets X litres »
est plus actionnable que de dire « va à cette station » sans condition. Les cas
limites (quantité nulle, capacité dépassée, conso invalide) sont déjà des
scénarios de test imposés au §13.

**Réversibilité.** **Réversible.** C'est un choix d'algorithme pur ; d'autres
règles de remplissage (ex. « pleins aux 3/4 ») restent possibles sans toucher à
la structure.

---

### D6 — Approximation du prix estimé pour le coût du détour

**Problème.** Le coût du détour utilise « le prix estimé du carburant » (§7).
Ce prix conditionne le calcul d'économie nette. Faut-il prendre le prix de la
candidate, le prix médian local, ou autre ?

**Option recommandée.** Utiliser **le prix de la station candidate** (celle où
l'on irait), car c'est le prix effectivement payé pour le carburant du détour.
Échec de résolution du prix → la station est traitée comme « données
insuffisantes » (pas de détour calculable).

**Justification.** Le coût du détour est le coût en carburant consommé pour
atteindre la candidate ; payer ce carburant au prix de la candidate est
l'estimation la plus cohérente (et la plus conservative en cas de candidate
moins chère : on ne gonfle pas l'économie nette). C'est aussi l'interprétation
la plus simple et explicable.

**Réversibilité.** **Réversible.** Changer pour le prix médian local est un
changement de constante d'algorithme, pas de structure.

---

## Décisions déjà tranchées par le cahier des charges

Ces points ont été lus et **ne sont pas re-demander** (rien d'inutile) :

| # | Décision | Réf. cahier des charges |
|---|---|---|
| 1 | Modèle DeepSeek V4 Flash obligatoire, aucun autre | §1 |
| 2 | Formules : économie brute, nette, coût du détour | §7, CONTEXT.md |
| 3 | Seuil de rentabilité par défaut = 1 € | §7 |
| 4 | Règles de fraîcheur : 24 h / 48 h | §6 |
| 5 | La logique de recommandation est un module pur (pas de Nuxt/HTTP/SQLite/env) | §12 |
| 6 | Algorithme déterministe et explicable, pas de LLM/ML pour la recommandation | §9 |
| 7 | Aucun prix inventé ; source officielle | §5, §10 |
| 8 | Source officielle = DGCCRF (data.economie.gouv.fr) | §10, docs/research |
| 9 | Abstraction `FuelPriceProvider`, domaine indépendant du format | §10 |
| 10 | Stack : Nuxt 3, Vue 3, TS strict, Nitro, SQLite, Drizzle, Zod, Vitest, Playwright, ESLint, Docker, PWA | §11 |
| 11 | Cartographie : OpenStreetMap, pas de services payants | §11 |
| 12 | Carburants : SP95, SP95-E10, SP98, E85, Gazole, GPLc | §6 |
| 13 | Rayons : 5, 10, 20, 30 km ; recherche ville / code postal | §6 |
| 14 | Profil véhicule stocké localement (localStorage, sans compte) | §6 |
| 15 | Recommandations : 5 types (plein, X litres, attendre, autre station, données insuffisantes) | §8 |
| 16 | Tendance : moyenne, médiane, variations 24 h / 7 j, score de fraîcheur | §9 |
| 17 | TDD obligatoire ; 18 scénarios de test imposés | §13 |
| 18 | UX mobile-first, PWA, mode sombre, accessibilité | §14 |
| 19 | Sécurité : pas de secret client, validation serveur, cache avec TTL, pas de journalisation de coordonnées | §15 |
| 20 | Historique local nécessaire (l'API ne fournit pas de série temporelle) | §8, §10, docs/research, ADR-0002 |
| 21 | Enseigne « si disponible » (champ absent du flux) | §6, docs/research |
| 22 | Repli de source (export complet → roulez-eco.fr XML → cache) | §10, docs/research |

## Résumé des décisions bloquantes identifiées

- **D1** — Format de retour unique de `calculateFuelRecommendation` (type
  discriminant + champs explicatifs). Réversible.
- **D2** — Défaut de distance supplémentaire : détour = différence de distance
  au centre du rayon (aller-retour), comparée à la station la plus proche.
  Réversible en produit, structurant pour le module.
- **D3** — Distances calculées côté serveur (haversine, pas de routage), passées
  en entrée du module pur. Réversible.
- **D4** — Historique local : snapshot quotidien station × carburant ; tendance
  J−1 / J−7 ; état vide → « Données insuffisantes » (partielle). Réversible.
- **D5** — Quantité « X litres » calculée : quantité minimale rentabilisant le
  détour, bornée par le volume disponible du réservoir. Réversible.
- **D6** — Coût du détour : prix de la station candidate (estimation
  conservative). Réversible.

Toutes les décisions structurantes portées par un réel trade-off et difficiles à
reverser **après** la rédaction de la spec et du schéma SQLite (D2, D4) seront
traduites en ADR. Le reste relève de la spec (`docs/specs/spec.md`).
