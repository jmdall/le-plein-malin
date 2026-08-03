# Spécification — « Je fais le plein ou non ? »

> **Statut** : `ready-for-agent`
> **Date** : 2026-08-03
> **Sources** : `CAHIER-DES-CHARGES.md`, `docs/specs/grill-decisions.md` (D1–D6,
> adoptées telles quelles), `docs/research/fuel-data-source.md`, `CONTEXT.md`,
> `docs/adr/0001..0004`, `PLAN.md`.
> **Vocabulaire** : le glossaire métier (`CONTEXT.md`) fait foi. Toute
> désignation ambiguë renvoie à ce glossaire.

---

## 1. Objectif

Une application web **mobile-first**, PWA, qui aide un automobiliste en France à
décider entre **faire le plein maintenant**, **mettre seulement X litres**,
**attendre**, ou **aller dans une autre station moins chère** — avec une
recommandation **explicable**, fondée sur les prix officiels des carburants
(DGCCRF), leur **fraîcheur**, la **géographie locale** et le **profil du
véhicule** de l'utilisateur.

La décision repose sur l'**économie nette réelle** : le gain de prix au litre,
moins le coût du carburant consommé pour le **détour**. **Aucun prix n'est
inventé** : toute valeur affichée provient de la source officielle ou du cache
local, et la date de mise à jour est toujours montrée.

La recommandation est produite par un **module métier pur et déterministe**
(`calculateFuelRecommendation`), sans LLM, sans ML, sans dépendance Nuxt, HTTP,
SQLite ou environnement. Les formules, seuils et règles sont fixes, documentés
et testés en TDD.

---

## 2. Périmètre MVP

### 2.1 Dans le périmètre

- **Localisation** : géolocalisation avec consentement, recherche par ville, par
  code postal, rayon de 5 / 10 / 20 / 30 km, et utilisation complète **sans
  géolocalisation**.
- **Carburants** : SP95, SP95-E10, SP98, E85, Gazole, GPLc. Carburant préféré
  mémorisé localement.
- **Liste des stations** : nom, enseigne si disponible, adresse, distance,
  carburant, prix, date/heure de mise à jour, âge de la donnée, économie brute,
  coût du détour, économie nette, bouton « Itinéraire ».
- **Profil du véhicule** : consommation moyenne (L/100 km), capacité du
  réservoir, niveau actuel du réservoir, carburant, quantité souhaitée, seuil
  minimal d'économie justifiant un détour. Stocké localement, sans compte.
- **Calculs** : coût du détour, économie brute, économie nette, seuil de
  rentabilité (défaut 1 €).
- **Recommandation** : les 5 types du cahier des charges, avec niveau de
  confiance, raisons, données utilisées/ignorées, calculs, hypothèses,
  fraîcheur, et marquage explicite des recommandations partielles.
- **Tendance** : historique local quotidien, prix minimum/moyen/médian local,
  écart à la médiane, variations 24 h / 7 j, tendance baisse/stable/hausse,
  score de fraîcheur. Algorithme déterministe et explicable.
- **Carte** OpenStreetMap, **favoris**, **historique** de consultation, **mode
  sombre**, **PWA installable**, états de chargement et erreurs compréhensibles.
- **API REST** Nitro et job de synchronisation périodique depuis la source
  officielle, avec repli automatique (voir §10).
- **Persistance** : SQLite via Drizzle ORM (stations, prix, historique,
  profil véhicule, favoris) + localStorage pour le profil et les favoris côté
  client.

### 2.2 Hors périmètre (MVP)

- Routage routier (aucun service payant) : distances en ligne droite (haversine),
  documentées comme hypothèse affichée (D3, ADR-0002).
- Import des fichiers annuels roulez-eco.fr (259 Mo XML) pour rétrocharger un
  historique (ADR-0004, option 2 rejetée).
- Compte utilisateur, synchronisation multi-appareils, backend d'authentification.
- Dérivation d'une enseigne probable depuis le libellé d'adresse (le flux ne
  publie pas l'enseigne — champ « si disponible », souvent absent).
- ML/LLM pour la recommandation, prédiction de prix, « prix à venir ».
- Agrégation horaire de l'historique (surdimensionnée : les prix bougent
  quelques fois par jour — ADR-0004).
- Notifications push, widget mobile, mode hors-ligne complet des prix (les prix
  sont toujours demandés au serveur ; seul le profil/favoris sont en
  localStorage).

---

## 3. Personas

### P1 — Romain, « le quotidien » (persona principal)
Automobiliste qui fait son plein 1 à 2 fois par mois. Pas de connaissance
particulière des prix. Veut **une réponse simple** : « je remplis maintenant, je
mets X litres, j'attends, ou je vais ailleurs » — avec une explication courte et
honnête. Utilise surtout le téléphone, sur le pouce, avec géolocalisation.

### P2 — Camille, « le comparateur »
Fait le plein sur la route, parfois loin de chez elle. S'intéresse aux chiffres :
économie nette, fraîcheur, tendance. Utilise la liste des stations, la carte et
le bouton « Voir le calcul ». Peut utiliser l'app **sans géolocalisation**
(recherche par ville/code postal).

### P3 — Nadia, « l'économe »
Consommation et budget maîtrisés. Configure précisément son **profil véhicule**,
son carburant préféré et un **seuil d'économie** plus élevé que 1 €. Elle ne veut
pas d'un détour pour gagner 50 centimes. Consulte la tendance pour décider si
elle attend quelques jours.

---

## 4. Parcours utilisateur

### Parcours principal (avec géolocalisation)
1. L'utilisateur ouvre l'app. Si aucun consentement n'a été donné, la bannière
   de consentement s'affiche (recommandée, non bloquante : refuser n'empêche pas
   l'usage).
2. Le rayon est initialisé à **10 km** autour de sa position (ou du centre de la
   recherche ville/CP si la géolocalisation est refusée).
3. La page principale affiche immédiatement la **recommandation**, la **station
   conseillée**, son **prix**, la **date de mise à jour**, l'**économie nette**,
   une **explication synthétique**, et les boutons « **Voir le calcul** » et «
   **Itinéraire** ».
4. En descendant : la **liste des stations** triées par économie nette
   décroissante (avec badge de fraîcheur), puis la **carte** OSM.
5. L'utilisateur peut filtrer le **carburant** et changer le **rayon** (5/10/20/
   30 km) ; ces préférences sont mémorisées localement.
6. « Voir le calcul » ouvre le panneau d'explication : calculs effectués,
   données utilisées/ignorées, hypothèses (détour estimé en ligne droite, prix de
   la candidate, etc.), fraîcheur, niveau de confiance.
7. « Itinéraire » ouvre un itinéraire vers la station conseillée (OSM).

### Parcours sans géolocalisation
1. L'utilisateur recherche une **ville** ou un **code postal**.
2. Le centre du rayon est le centroïde géocodé de la ville (le rayon est
   résolu côté serveur).
3. La **station de référence** est la station **la plus proche du centre du
   rayon** ; le détour de chaque candidate est
   `max(0, dist_candidate − dist_référence) × 2` (aller-retour, appliqué **une
   seule fois** sur la différence). Voir D2 / ADR-0002.
4. L'hypothèse « distance en ligne droite, aller-retour, relative à la station
   la plus proche » est **affichée** dans « Voir le calcul ».

### Parcours de configuration
1. « Profil véhicule » : saisie consommation, capacité, niveau, carburant,
   quantité souhaitée (optionnelle), seuil d'économie (défaut 1 €).
2. Enregistré en localStorage ; validé par Zod (valeurs numériques strictement
   positives, quantité ≥ 0, niveau ≤ capacité).

### Parcours d'erreur
1. Source officielle indisponible : bascule automatique sur le repli puis sur le
   cache (ADR-0003, §13 de la recherche).
2. Aucune station dans le rayon / aucun prix à jour : recommandation
   « **Données insuffisantes** » avec message compréhensible et suggestions
   (élargir le rayon, changer de carburant).

---

## 5. Exigences fonctionnelles détaillées

### 5.1 Localisation
- [LOC-1] Géolocalisation avec **consentement** explicite ; refus sans blocage.
- [LOC-2] Recherche par **ville** ou **code postal** (sans géolocalisation).
- [LOC-3] Rayon parmi **5 / 10 / 20 / 30 km**, sélectionnable ; défaut **10 km**.
- [LOC-4] La position précise n'est **ni journalisée ni conservée** sans
  consentement ; seuls le rayon, la ville/CP et les distances agrégées sont
  envoyés au serveur.
- [LOC-5] Les distances utilisateur→station et candidate→référence sont
  calculées **côté serveur** avec une fonction **haversine pure** stockée dans
  `domain/fuel-prices` (D3) ; aucun routage routier en MVP.

### 5.2 Carburants
- [CAR-1] Support de **SP95, SP95-E10, SP98, E85, Gazole, GPLc** (correspondance
  avec `prix_nom` : Gazole, SP95, SP98, E10, E85, GPLc).
- [CAR-2] **Carburant préféré** mémorisé localement et présélectionné.
- [CAR-3] Une station **sans prix** pour le carburant sélectionné, ou en
  **rupture** (`rupture` non nul), ou **fermée** (`fermeture` non nul) est exclue
  des candidats pour ce carburant (recherche §10).
- [CAR-4] GPLc : même logique de calcul que les autres carburants (pas de
  traitement spécifique hors prix).

### 5.3 Liste des stations
- [STA-1] Chaque station affiche : nom, enseigne si disponible, adresse, ville,
  distance, carburant, prix (€/L), date/heure de mise à jour, âge de la donnée,
  économie brute, coût du détour, économie nette, bouton « Itinéraire ».
- [STA-2] Tri par défaut : **économie nette décroissante** (station de référence
  et stations non rentables en bas, ou masquables).
- [STA-3] Badge de fraîcheur sur chaque prix : « frais » (≤ 24 h),
  « potentiellement obsolète » (24–48 h), « exclu des recommandations »
  (> 48 h) — ces dernières **toujours visibles** mais marquées (recherche §11).
- [STA-4] Filtres : carburant, rayon ; favoris épinglés en tête.
- [STA-5] L'utilisateur peut marquer une station en **favori** (localStorage,
  synchronisé avec la table `favorites` serveur si applicable).

### 5.4 Profil véhicule
- [VEH-1] Champs : consommation moyenne (L/100 km), capacité du réservoir (L),
  niveau actuel (L ou %), carburant, quantité souhaitée (optionnelle, L), seuil
  minimal d'économie (€, défaut **1 €**).
- [VEH-2] Validation Zod : consommation > 0, capacité > 0, 0 ≤ niveau ≤ capacité,
  quantité ≥ 0, seuil ≥ 0.
- [VEH-3] Stocké en **localStorage**, sans compte utilisateur.
- [VEH-4] Un profil absent ou partiel ne bloque pas l'usage : les valeurs
  manquantes produisent une **recommandation partielle** ou « Données
  insuffisantes » pour les calculs qui en dépendent.

### 5.5 Calculs
Formules du cahier des charges (§7), confirmées par `CONTEXT.md` :

```
coût du détour = distance supplémentaire A/R (km) × consommation / 100 × prix estimé
économie brute = (prix de référence − prix candidat) × quantité achetée (L)
économie nette = économie brute − coût du détour
recommandation autre station ⇔ économie nette ≥ seuil utilisateur (défaut 1 €)
```

- [CAL-1] Le **prix estimé** du coût du détour est le **prix de la station
  candidate** (D6) ; prix non résolu → station traitée en « données
  insuffisantes », pas de détour calculable.
- [CAL-2] La **distance supplémentaire A/R** est le détour réel défini en D2 :
  `max(0, dist_candidate − dist_référence) × 2` (sans géolocalisation), ou le
  détour réel fourni par le serveur si la position exacte est connue. Borne à
  `≥ 0` : une candidate sur le trajet n'est jamais pénalisée.
- [CAL-3] Le seuil est une condition **stricte** : autre station recommandée
  **si et seulement si** `économie nette ≥ seuil` (égalité comprise).

### 5.6 Recommandation
- [REC-1] Cinq types, discriminés par `type` :
  `fill-now` (« Fais le plein maintenant »), `partial-fill` (« Mets seulement
  X litres »), `wait` (« Tu peux attendre »), `go-to-station` (« Va plutôt à
  cette station »), `insufficient-data` (« Données insuffisantes »).
- [REC-2] Pour chaque recommandation, afficher : **niveau de confiance**, raisons
  principales, données utilisées, données ignorées, calculs effectués,
  hypothèses, fraîcheur des données. Tous ces champs sont **fournis par le
  module** (D1), l'UI ne recalculant rien.
- [REC-3] Une **recommandation partielle** (`isPartial: true`) est émise quand
  une partie des données manque (ex. pas de tendance faute d'historique, pas de
  géolocalisation) ; la confiance est réduite et les données manquantes sont
  affichées explicitement. Jamais confondue avec une recommandation complète.
- [REC-4] Toute formulation de tendance utilise « tendance probable », « selon
  les données récentes », « les données disponibles suggèrent » — **jamais** une
  certitude.
- [REC-5] Logique de décision (déterministe, à détailler en tickets) :
  1. Pas de données fraîches ni de prix → `insufficient-data`.
  2. Réservoir critique (quasi vide) → tendre vers `fill-now` sauf forte
     probabilité de baisse.
  3. Réservoir quasi plein → `wait` ou `partial-fill` selon le contexte.
  4. Tendance baissière + réservoir suffisant → `wait` (avec caveat « tendance
     probable »).
  5. Une candidate vérifie `économie nette ≥ seuil` → `go-to-station`
     (`recommendedStation` = celle au meilleur `économie nette`).
  6. Sinon → `fill-now` ou `partial-fill` selon la quantité et le niveau.

### 5.7 Tendance
- [TRE-1] Historique accumulé localement : **snapshot quotidien** par
  `(station_id, carburant, jour)` (D4, ADR-0004), upserté à chaque
  synchronisation du jour.
- [TRE-2] Indicateurs au minimum : prix minimum local, prix moyen, prix médian,
  écart par rapport à la médiane, variation sur 24 h (J−1), variation sur
  7 jours (J−7), tendance (baisse / stable / hausse), score de fraîcheur.
- [TRE-3] Algorithme **déterministe et explicable** : moyenne glissante, médiane,
  variations absolue et relative, seuils documentés, pondération selon
  l'ancienneté. Aucun LLM/ML.
- [TRE-4] Moins de 2 points de comparaison (J−1 ou J−7 indisponible) →
  tendance « Données insuffisantes », et la recommandation continue sur les
  **prix locaux courants** (recommandation partielle).
- [TRE-5] Le score de fraîcheur découle des règles 24 h / 48 h.

---

## 6. Règles de fraîcheur

| Âge de `prix_maj` | Statut | Affichage | Recommandation |
|---|---|---|---|
| ≤ 24 h | **Frais** | normal | éligible |
| 24 – 48 h | **Potentiellement obsolète** | atténué + badge | éligible par défaut, mais dégrade la confiance ; exclue si une alternative fraîche existe |
| > 48 h | **Obsolète** | badge explicite | **exclue par défaut** des recommandations |

- [FRE-1] La **date et l'heure** de mise à jour sont toujours affichées avec le
  prix (recherche §10, cahier des charges §6).
- [FRE-2] Le cache serveur ne sert **jamais** un prix de plus de 24 h sans le
  signaler explicitement.
- [FRE-3] Les prix > 48 h restent visibles dans la liste, mais ne participent
  pas aux calculs de recommandation par défaut.

---

## 7. Exigences non fonctionnelles

### 7.1 Accessibilité (cahier des charges §14)
- [NFR-ACC-1] Navigation **entièrement au clavier** ; focus visible.
- [NFR-ACC-2] **Contrastes** suffisants (WCAG AA) en mode clair et sombre.
- [NFR-ACC-3] Labels, rôles et `aria` sur tous les champs, boutons et zones de
  la recommandation.
- [NFR-ACC-4] Les couleurs ne sont jamais le seul vecteur d'information
  (badges de fraîcheur, tendance hausse/baisse) : texte ou symbole doublé.

### 7.2 Responsive
- [NFR-RES-1] Mobile-first : la page principale est utilisable sur un écran
  ≤ 360 px de large ; liste, carte et panneau « Voir le calcul » s'adaptent
  jusqu'au desktop.
- [NFR-RES-2] Les contrôles tactiles sont de taille ≥ 44 px.

### 7.3 PWA
- [NFR-PWA-1] Manifeste + service worker ; **installation** possible.
- [NFR-PWA-2] Pages statiques (mentions, erreurs, structure) lisibles
  raisonnablement **sans JavaScript**.
- [NFR-PWA-3] Le mode hors-ligne ne sert pas de prix périmés : les prix
  viennent toujours du serveur.

### 7.4 Performance
- [NFR-PERF-1] Premier rendu de la recommandation < 2 s sur réseau mobile
  typique (données locales cache + calcul pur côté serveur).
- [NFR-PERF-2] Le job de synchronisation est paginé ou par export complet,
  **jamais** un fetch par station (73 493 enregistrements — recherche §2).
- [NFR-PERF-3] Index SQLite sur les colonnes de requête (voir §9).

### 7.5 Sécurité et vie privée (cahier des charges §15)
- [NFR-SEC-1] **Aucun secret côté client** ; `.env` git-ignoré, `.env.example`
  fourni.
- [NFR-SEC-2] **Validation de toutes les entrées** côté serveur (Zod).
- [NFR-SEC-3] Limitation des appels vers les fournisseurs externes ; **cache
  avec TTL** (1 h minimum), expiration appliquée.
- [NFR-SEC-4] **Pas de compte** exigé ; la position précise n'est pas conservée
  ni journalisée sans consentement ; pas de log des coordonnées.
- [NFR-SEC-5] Erreurs réseau gérées **sans inventer de données** : réponse
  « Données insuffisantes » avec erreur explicite, repli sur le cache marqué
  « données en cache (date) ».

---

## 8. API REST prévue (Nitro)

| Méthode | Route | Rôle | Requête → Réponse |
|---|---|---|---|
| GET | `/api/stations` | Liste des stations dans le rayon | `?lat&lon&radius=10&fuel=Gazole&q=ville` (ou `city`/`postalCode`) → `{ stations: StationPrice[], referenceStation: StationPrice, query: {center, radius, fuel} }` |
| GET | `/api/recommendation` | Recommandation complète | mêmes params + `vehicleProfile` → `{ recommendation: FuelRecommendation }` |
| GET | `/api/stations/:id` | Détail d'une station | `:id` → `{ station, prices: Price[] }` |
| GET | `/api/stations/:id/history` | Tendance d'une station/carburant | `:id?fuel=` → `{ indicators: TrendIndicators }` (min, moyenne, médiane, écart médiane, Δ24 h, Δ7 j, tendance, score de fraîcheur) |
| GET | `/api/health` | Health-check | `{ status: "ok", lastSync }` |

Contrats :
- Toutes les routes **valident les entrées avec Zod** (distance, rayon ∈ {5, 10,
  20, 30}, fuel ∈ 6 carburants, coordonnées bornées) et répondent en erreur
  structurée `{ error: { code, message } }`.
- Le serveur calcule les distances (haversine), choisit la **station de
  référence** (la plus proche du centre) et injecte les distances dans
  `FuelRecommendationInput`. Le module pur ne voit que des km.
- La position précise de l'utilisateur n'est transmise que comme paramètre de
  requête ; elle n'est jamais persistée ni loggée.

---

## 9. Modèle de données SQLite (Drizzle)

### 9.1 `stations`
| Colonne | Type | Contrainte |
|---|---|---|
| `id` | text (PK) | id station source (ex. `1200004`) |
| `name` | text | nom de la station (dérivé) |
| `brand` | text | null (enseigne « si disponible », souvent absente) |
| `address` | text | `adresse` |
| `city` | text | `ville` |
| `postal_code` | text | `cp` |
| `latitude` | real | |
| `longitude` | real | |
| `department_code` | text | null |
| `region_code` | text | null |
| `closed` | boolean | `fermeture` non nul |
| `synced_at` | datetime | dernière synchronisation |

### 9.2 `prices`
| Colonne | Type | Contrainte |
|---|---|---|
| `station_id` | text | FK → `stations.id`, ON DELETE CASCADE |
| `fuel` | text | `FuelType` (Gazole, SP95, SP98, E10, E85, GPLc) |
| `price` | real | €/L, `prix_valeur` normalisé en nombre |
| `updated_at` | datetime | `prix_maj` (ISO 8601) |
| `rupture` | boolean | rupture temporaire/définitive |
| `synced_at` | datetime | |
| PK | | `(station_id, fuel)` |

### 9.3 `price_history` (historique de tendance, ADR-0004)
| Colonne | Type | Contrainte |
|---|---|---|
| `station_id` | text | FK → `stations.id` |
| `fuel` | text | `FuelType` |
| `day` | text (YYYY-MM-DD) | jour de l'observation |
| `price` | real | snapshot du jour (dernier prix observé) |
| `synced_at` | datetime | |
| PK | | `(station_id, fuel, day)` — upsert quotidien |

Index : `(fuel, day)` pour la tendance, `(station_id, fuel)` pour la lecture.

### 9.4 `vehicle_profile`
Profil véhicule par défaut (côté serveur, pour la reco initiale ; le profil
« courant » de l'utilisateur vit en localStorage, validé par Zod) :
| Colonne | Type | Contrainte |
|---|---|---|
| `id` | integer (PK, autoincrement) | singleton (1 ligne) |
| `fuel` | text | `FuelType` |
| `consumption` | real | L/100 km, > 0 |
| `tank_capacity` | real | L, > 0 |
| `current_level` | real | L, 0 ≤ x ≤ capacité |
| `preferred_quantity` | real | null = non renseignée |
| `savings_threshold` | real | €, défaut 1 |
| `updated_at` | datetime | |

### 9.5 `favorites`
| Colonne | Type | Contrainte |
|---|---|---|
| `station_id` | text | FK → `stations.id` |
| `created_at` | datetime | |
| PK | | `station_id` |

### 9.6 Cache / synchronisation
Le cache des réponses du provider (snapshots) est constitué par `prices` +
`stations` avec un TTL de **1 h minimum** et un `synced_at` exploité par le job
(ADR-0003, recherche §11–12). Le job **append** `price_history` à chaque
synchronisation (upsert quotidien), tolère l'échec partiel (aucune écriture
partielle douteuse) et **purge** les prix de plus de 48 h hors recommandations
(toujours visible avec badge).

---

## 10. Interface du module pur `calculateFuelRecommendation`

### 10.1 Règles du module (invariants, `CONTEXT.md`)
- **Pureté** : aucune dépendance Nuxt, aucun HTTP, aucun accès SQLite, aucune
  lecture d'environnement. Testable avec des objets simples.
- Entrées : des **distances déjà calculées** (km) et des **prix déjà
  normalisés** ; le module ne fait jamais de géométrie (D3).
- Sortie : objet immuable complet, discriminé par `type` (D1), avec tous les
  champs explicatifs.
- Le **seam de test principal et unique** du produit est ce module : tous les
  scénarios métier du §13 se testent ici, sans mocks d'infrastructure.

### 10.2 Types détaillés

```ts
// domain/fuel-prices/types.ts
export const FUEL_TYPES = ['Gazole', 'SP95', 'SP98', 'E10', 'E85', 'GPLc'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export interface GeoPoint { lat: number; lon: number }

export interface StationPrice {
  id: string
  name: string
  brand: string | null      // « si disponible » — souvent null
  address: string
  city: string
  postalCode: string
  position: GeoPoint
  fuel: FuelType
  price: number             // €/L, normalisé en nombre
  updatedAt: Date           // prix_maj — jamais inventé
}

export interface FreshnessInfo {
  ageInHours: number
  status: 'fresh' | 'stale' | 'obsolete'   // ≤24h / 24–48h / >48h
  score: number                            // 0..1
}

// domain/vehicle/types.ts
export interface VehicleProfile {
  fuel: FuelType
  consumption: number        // L/100km, > 0
  tankCapacity: number       // L, > 0
  currentLevel: number       // L, 0 ≤ x ≤ capacité
  preferredQuantity: number | null
  savingsThreshold: number   // €, défaut 1
}

// domain/recommendation/types.ts
export interface CandidateWithDistance {
  station: StationPrice
  detourDistanceKm: number   // distance supplémentaire A/R déjà calculée (D2/D3)
}

export interface FuelRecommendationInput {
  fuelType: FuelType
  quantityToBuy: number          // litres
  vehicle: VehicleProfile
  referenceStation: StationPrice
  candidates: CandidateWithDistance[]
  threshold: number              // €, défaut 1
  freshnessLimits: { staleAfterHours: number; obsoleteAfterHours: number }
  // défauts : 24 et 48
}

export type RecommendationType =
  | 'fill-now'        // « Fais le plein maintenant »
  | 'partial-fill'    // « Mets seulement X litres »
  | 'wait'            // « Tu peux attendre »
  | 'go-to-station'   // « Va plutôt à cette station »
  | 'insufficient-data' // « Données insuffisantes »

export interface FuelRecommendation {
  type: RecommendationType
  confidence: number            // 0..1
  quantityToBuy: number | null  // litres, uniquement pour partial-fill
  recommendedStation: StationPrice | null
  referenceStation: StationPrice | null
  detourCost: number | null
  grossSavings: number | null
  netSavings: number | null
  reasons: string[]             // raisons principales
  usedData: string[]            // données utilisées
  ignoredData: string[]         // données ignorées
  calculations: string[]        // calculs effectués
  assumptions: string[]         // hypothèses (détour ligne droite, prix candidat…)
  freshness: FreshnessInfo      // âge + score
  isPartial: boolean            // recommandation partielle (confiance réduite)
}

export declare function calculateFuelRecommendation(
  input: FuelRecommendationInput
): FuelRecommendation
```

### 10.3 Sémantique des décisions adoptées (D1–D6)

| Décision | Effet sur le module |
|---|---|
| **D1** | Un seul type `FuelRecommendation` discriminé par `type`, tous les champs explicatifs remplis ; `isPartial` explicite, jamais inféré de la confiance. |
| **D2** | `detourDistanceKm` arrive déjà calculée (le module ne calcule pas de géométrie). |
| **D3** | Entrée = `CandidateWithDistance[]` ; la haversine vit côté serveur, dans `domain/fuel-prices`, hors du module. |
| **D4** | Pas d'historique suffisant → tendance « insuffisante », `isPartial: true`, décision sur les prix courants. |
| **D5** | `partial-fill` : `X = min(quantité minimale rentabilisant le détour, volume disponible du réservoir)` — `seuil / différence de prix au litre`, arrondi au litre supérieur, borné par `capacité − niveau` et par `preferredQuantity`. Si même le plein ne rentabilise pas le détour → `wait` ou `fill-now` selon niveau et tendance. |
| **D6** | Coût du détour = `detourDistanceKm × conso / 100 × prix de la candidate` ; prix non résolu → candidate en `insufficient-data`. |

### 10.4 Seam de test
**Un seul seam** : `calculateFuelRecommendation` + la haversine pure de
`domain/fuel-prices`. Tous les scénarios §13 se testent au niveau de ce module
avec des objets simples ; aucune règle métier n'est testée à travers l'API, la
base ou l'UI. La logique de tendance (`domain/trend`) est un second module pur
testable de la même façon. L'API Nitro n'a que des tests d'intégration légers
(validation Zod + orchestration), l'UI est couverte par Playwright (parcours
principal uniquement).

---

## 11. Critères d'acceptation liés aux 18 scénarios de test (§13 du cahier des charges)

Chaque scénario = un critère d'acceptation du module pur (tests Vitest, TDD) ;
tous doivent être écrits **avant** le code de la règle correspondante. Les
scénarios marqués (produit) impliquent en plus une vérification UI/e2e.

| # | Scénario §13 | Critère d'acceptation |
|---|---|---|
| 1 | Détour non rentable | `économie nette < seuil` → jamais `go-to-station` ; `type` ∈ {`fill-now`, `wait`, `partial-fill`} ; `netSavings` et `detourCost` présents. |
| 2 | Détour rentable | `économie nette ≥ seuil` et `netSavings` maximal parmi les candidats → `go-to-station`, `recommendedStation` = candidat choisi, `netSavings ≥ 0`. |
| 3 | Économie exactement égale au seuil | `économie nette === seuil` → **incluse** dans `go-to-station` (seuil strict `≥`, égalité comprise, CAL-3). |
| 4 | Prix de plus de 24 heures | `status: 'stale'` ; affichage atténué ; `confidence` dégradée ; `freshness.score < 1` ; toujours éligible si aucune alternative fraîche. |
| 5 | Prix de plus de 48 heures | `status: 'obsolete'` ; **exclu par défaut** des candidats/recommandations ; badge explicite ; reste visible en liste. |
| 6 | Station sans carburant sélectionné | Station absente du flux `prices` pour ce carburant, ou `rupture`/`fermeture` → exclue des candidats (CAR-3) ; si aucune candidate → `insufficient-data`. |
| 7 | Historique insuffisant | Moins de 2 points de comparaison (J−1/J−7) → tendance « insuffisante » ; `isPartial: true` ; décision sur prix courants (TRE-4). |
| 8 | Réservoir presque vide | Niveau critique (ex. `niveau ≤ 10% capacité`) → biais vers `fill-now` même si tendance baissière ; `reasons` l'expliquent. |
| 9 | Réservoir presque plein | Niveau élevé → `wait` ou `partial-fill` ; jamais `fill-now` si pas de besoin ; `quantityToBuy` cohérent avec l'espace disponible. |
| 10 | Quantité supérieure à la capacité disponible | `quantityToBuy` bornée à `capacité − niveau` ; jamais de dépassement ; `calculations` le montrent. |
| 11 | Quantité nulle | `quantityToBuy = 0` ou quantité souhaitée = 0 → pas de détour rentable (économie brute nulle) → `wait`/`fill-now` selon niveau ; jamais `go-to-station`. |
| 12 | Consommation invalide | `consumption ≤ 0` ou NaN → refus de validation (Zod, erreur 400 côté API) ; module ne calcule pas de `detourCost` invalide ; le profil est rejeté. |
| 13 | Plusieurs stations au même prix | À distance égale du centre, la **station de référence** est celle **la plus proche** (départage déterministe : distance, puis id) ; classement des candidates stable et reproductible. |
| 14 | Données incohérentes | Ex. `prix_maj` futur, `currentLevel > capacité`, coordonnées hors France → données rejetées/neutralisées ; recommandation dégradée (`isPartial`), jamais d'exception non gérée. |
| 15 | Prix aberrant | Prix sortant d'un intervalle documenté (ex. < 0,5 €/L ou > 3,5 €/L pour l'essence, hors GPLc/E85) → signalé dans `ignoredData`, exclu du calcul local moyen/médian (déterministe), jamais inventé. |
| 16 | Absence de géolocalisation | Mode ville/CP : référence = plus proche du centre du rayon, détour = `max(0, dist_c − dist_r) × 2` (D2) ; l'hypothèse figure dans `assumptions` ; `isPartial` selon perte de précision. |
| 17 | Échec de la source officielle | Provider indisponible → repli automatique (Opendatasoft → export → roulez-eco.fr → cache) ; échec total → `insufficient-data` avec erreur explicite ; **aucun prix inventé** (ADR-0003). |
| 18 | Données mises en cache / absence de station proche | (a) Cache servi avec `synced_at` et badge « données en cache (date) », jamais > 24 h sans signalement ; (b) aucun candidat dans le rayon → `insufficient-data` avec suggestions (élargir le rayon, changer de carburant). |

**Critères transverses** :
- Chaque règle métier suit la boucle TDD (test rouge → code minimal → vert →
  refactor) ; aucun test ne valide uniquement des mocks ou des détails internes.
- Le build passe : `npm run lint && npm run typecheck && npm run test &&
  npm run test:e2e && npm run build` (§18 du cahier des charges).

---

## 12. Hors périmètre de la spec (pour la découpe en tickets)

La découpe en tickets (`to-tickets`) suivra les sections ci-dessus avec les
numéros d'exigence en références. Les ADR existants (0001–0004) restent en
vigueur ; toute nouvelle décision structurante pendant l'implémentation fait
l'objet d'un nouvel ADR et d'une mise à jour cohérente de `CONTEXT.md` et de
cette spec.
