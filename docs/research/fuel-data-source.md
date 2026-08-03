# Source de données : prix des carburants en France

> Document produit par le skill `research` (workflow Matt Pocock) — toutes les
> informations ci-dessous ont été **vérifiées par des appels HTTP réels** le
> 2026-08-03 (voir section « Vérifications effectuées »).

## 1. Source officielle

**« Prix des carburants en France - Flux quotidien »** — dataset publié par la
**DGCCRF** (Direction générale de la concurrence, de la consommation et de la
répression des fraudes), rattaché aux **Ministères économiques et financiers**.

- Portail national : https://www.prix-carburants.gouv.fr/
- Fiche data.gouv.fr : https://www.data.gouv.fr/fr/datasets/prix-des-carburants-en-france-flux-quotidien-1/
  (slug `prix-des-carburants-en-france-flux-quotidien-1`, id `6615d83d7d7c66d5ec00c511`)
- Portail ouvert de la donnée : https://data.economie.gouv.fr/

C'est la source **officielle et légale** des prix pratiqués par les stations-service
en France métropolitaine et en Outre-mer : les exploitants ont l'obligation
réglementaire de déclarer leurs prix, que la DGCCRF consolide et publie.

## 2. URL et mécanisme d'accès

### 2.1 API principale (recommandée pour le MVP)

API Opendatasoft **Explore v2.1** sur le portail data.economie.gouv.fr, dataset
`prix-carburants-quotidien` :

```
https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants-quotidien/records?limit=100&where=...
```

Endpoints testés et fonctionnels :

| Endpoint | URL vérifiée | Résultat |
|---|---|---|
| Records (JSON) | `…/datasets/prix-carburants-quotidien/records?limit=2` | HTTP 200, `total_count: 73493` |
| Export CSV | `…/datasets/prix-carburants-quotidien/exports/csv?use_labels=true` | HTTP 200 |
| Export JSON | `…/datasets/prix-carburants-quotidien/exports/json` | HTTP 200 |
| Export GeoJSON | `…/datasets/prix-carburants-quotidien/exports/geojson` | HTTP 200 |
| Export Shapefile | `…/datasets/prix-carburants-quotidien/exports/shp` | HTTP 200 |

L'API supporte le filtrage spatial (`where=geo_distance(...)`) et les paramètres
`limit`/`offset`/`refine`. Un test `geo_distance` a retourné 152 stations autour
d'un point donné (Gennevilliers).

### 2.2 Fichiers historiques (roulez-eco.fr)

Fichiers XML bruts maintenus par le ministère, accessibles sans clé :

- **Instantané quotidien** : `https://donnees.roulez-eco.fr/opendata/jour`
  → zip contenant `PrixCarburants_quotidien_YYYYMMDD.xml`
  (vérifié : fichier du 2026-08-02, 14,4 Mo, **9 917 stations**, 32 082 prix).
- **Historique annuel complet** : `https://donnees.roulez-eco.fr/opendata/annee/2026`
  → zip de 22 Mo contenant `PrixCarburants_annuel_2026.xml` (259 Mo, toutes les
  mises à jour de l'année — série temporelle complète).

> ⚠️ Le dataset `prix-carburants-fichier-instantane-test-ods-copie` (ancien nom
> documenté dans plusieurs tutoriaux) **n'existe plus** sur data.economie.gouv.fr
> (HTTP 404 `NotFoundResource`). Ne pas l'utiliser.

## 3. Format des données

### API v2.1 (dataset `prix-carburants-quotidien`)

JSON avec un **enregistrement par couple station × carburant** (dénormalisé) :

```json
{
  "id": "1200004",
  "adresse": "79 RUE DE LA REPUBLIQUE",
  "ville": "BELLEGARDE",
  "cp": "01200",
  "geom": { "lon": 5.88, "lat": 46.11 },
  "prix_nom": "Gazole",
  "prix_valeur": 2.185,
  "prix_maj": "2026-07-29T12:19:55+00:00",
  "reg_name": "Auvergne-Rhône-Alpes",
  "dep_name": "Ain",
  "services_service": null,
  "rupture": null,
  "horaires_automate_24_24": "Non"
}
```

Champs disponibles (vérifiés sur un enregistrement réel) :
`id, cp, pop, adresse, ville, geom {lon,lat}, prix_maj, prix_id, prix_valeur,
prix_nom, com_arm_code, reg_code, reg_name, dep_code, dep_name, com_arm_name,
services_service, rupture_nom, rupture_debut, rupture_fin,
horaires_automate_24_24, horaires, rupture, fermeture, epci_code, epci_name`.

Note : `prix_nom` prend les valeurs `Gazole`, `SP95`, `SP98`, `E10` (= SP95-E10),
`E85`, `GPLc` (noms français, id 1..6). La géométrie est disponible soit dans
`geom` (objet `{lon, lat}`) soit via `longitude`/`latitude` (valeurs entières
E6 : 1/10 000 000 de degré).

### Fichiers XML roulez-eco.fr

Structure `<pdv>` (point de vente) avec attributs `id`, `lat`, `lon`, adresse,
ville, cp ; enfants `<prix nom="Gazole" id="1" maj="…" valeur="2.185"/>`,
`<rupture>`, `<horaires>`, `<services>`. Le fichier quotidien contient toutes
les mises à jour du jour (période couverte de 2009 à la veille — certaines
stations n'ont pas été actualisées depuis longtemps).

## 4. Fréquence annoncée

- data.gouv.fr : `frequency: daily` (quotidien).
- Le fichier « instantané » est mis à jour **plusieurs fois par jour**
  (habituellement 2 à 3 fois en semaine), dès que des prix sont déclarés.
- Dernière mise à jour observée sur data.gouv.fr : `2026-08-02T06:05:39+00:00`.

## 5. Fréquence réellement observable

- Les prix individuels portent un horodatage `prix_maj` précis (ex.
  `2026-07-31 15:37:38`). Les stations mettent à jour leurs prix à des moments
  hétérogènes : certaines le jour même, d'autres depuis plusieurs jours.
- Le fichier `jour` de roulez-eco.fr du 2026-08-02 contient 13 663 horodatages
  `maj` distincts étalés sur la journée → **les mises à jour arrivent en continu**.
- En pratique pour une application : interroger l'API 2 à 4 fois par jour suffit ;
  le prix d'une station n'a pas besoin d'être rafraîchi plus souvent que toutes
  les heures (sa `prix_maj` n'aura pas bougé).

## 6. Conditions de réutilisation

- Licence : **`fr-lo` = Licence Ouverte / Open Licence 2.0 (Etalab)** — vérifiée
  sur data.gouv.fr. Réutilisation libre, obligation de mention de la source et
  de la date de mise à jour.
- Aucune clé API requise pour lire les données publiques.
- **Mention de source obligatoire** : « Prix des carburants en France - Flux
  quotidien, DGCCRF / Ministères économiques et financiers, data.economie.gouv.fr,
  licence ouverte ».

## 7. Champs disponibles (récapitulatif utile au domaine)

| Besoin métier | Champ(s) |
|---|---|
| Identité station | `id`, `adresse`, `ville`, `cp`, `reg_name`, `dep_name` |
| Position | `geom.lon`, `geom.lat` (ou `longitude`, `latitude` en E6) |
| Carburant | `prix_nom` (Gazole/SP95/SP98/E10/E85/GPLc), `prix_id` |
| Prix | `prix_valeur` (€/L, nombre décimal) |
| Fraîcheur | `prix_maj` (ISO 8601 avec offset) |
| Ruptures | `rupture` / `rupture_nom`, `rupture_debut`, `rupture_fin`, `rupture` |
| Services/horaires | `services_service`, `horaires`, `horaires_automate_24_24`, `fermeture` |
| Territoire | `dep_code`, `reg_code`, `epci_code`, `com_arm_code` |

⚠️ Pas de champ « enseigne » dans le flux (le nom de l'enseigne n'est pas publié
systématiquement — la spécification le prévoit « si disponible », donc ce champ
restera souvent absent ; on peut dériver une enseigne probable du libellé
d'adresse uniquement hors MVP).

## 8. Présence ou absence d'historique

- **L'API `prix-carburants-quotidien` ne fournit que l'état courant** (le dernier
  prix déclaré par chaque station/carburant). Pas de série temporelle via l'API.
- **L'historique existe côté fichiers** : `https://donnees.roulez-eco.fr/opendata/annee/2026`
  contient toutes les mises à jour de l'année 2026 (série temporelle complète,
  vérifié : téléchargement OK, 259 Mo XML). Des fichiers pour les années
  précédentes sont disponibles (`/opendata/annee/2025`, etc.).
- **Conséquence MVP** : la tendance (§9 du cahier des charges) sera construite à
  partir de l'historique **local** accumulé par l'application (chaque synchronisation
  append les observations dans SQLite), pas depuis l'API. C'est la stratégie
  retenue dans l'ADR-0002.

## 9. Erreurs possibles

- Dataset renommé/supprimé côté Opendatasoft (comme `…-test-ods-copie` → 404).
- `geom` peut être `null` pour certaines stations (ex. premier record testé :
  `geom: null`, `prix_*: null` → station sans prix déclaré).
- Valeurs `prix_valeur` en chaîne ou en nombre selon l'endpoint (CSV = chaîne,
  JSON = nombre) — normaliser systématiquement.
- Codes postaux/coordonnées erronés ou absents pour de rares stations.
- Timeout réseau, quota de l'API (limites Opendatasoft), indisponibilité
  momentanée du portail.

## 10. Données manquantes

- Stations **sans prix** pour un carburant donné (champ `prix_*` null) → exclure
  de la liste des candidats pour ce carburant.
- **Ruptures** : `rupture` non nul = carburant indisponible (définitive ou
  temporaire, cf. `rupture_debut`/`rupture_fin`) → ne pas proposer ce carburant.
- **Stations fermées** : `fermeture` non nul (`@type="T"` = temporaire) → filtrer.
- Enseigne absente (cf. §7).
- Certaines stations n'ont aucun prix à jour → à l'écart des recommandations
  mais visibles dans la liste avec « Données insuffisantes ».

## 11. Stratégie de cache

- **Cache serveur (Nitro)** : les réponses API sont stockées en SQLite
  (table `price_snapshots` / `stations`) avec un TTL de **1 heure** minimum.
- **Règles de fraîcheur du cahier des charges** (décision produit) :
  - `prix_maj` > 24 h → données « potentiellement obsolètes » (affichage atténué) ;
  - `prix_maj` > 48 h → **exclues par défaut des recommandations**.
- Le cache ne doit jamais servir un prix plus vieux que 24 h sans le signaler
  explicitement à l'utilisateur.
- Pas de cache côté client pour les prix (toujours demander au serveur) ; le
  profil véhicule et les favoris sont en localStorage.

## 12. Stratégie de synchronisation

- Job Nitro périodique (toutes les 2 h en semaine, cf. fréquence observée) :
  1. `GET /records?limit=100&offset=…` en paginant (73 493 enregistrements,
     ~735 appels à 100 — ou utiliser l'export JSON complet en un appel).
  2. Upsert des stations (`id` station) et des prix (`station_id` + `prix_nom`).
  3. Append des observations dans la table d'historique (`price_history`) pour
     alimenter la tendance.
  4. Marquage `synced_at` ; purge des prix de plus de 48 h hors recommandations.
- Le job tolère l'échec partiel : si un appel échoue, on garde les données
  existantes et on retente au prochain tick (pas d'écriture partielle douteuse).
- Repli : si l'API Opendatasoft est indisponible, basculer sur le fichier
  `donnees.roulez-eco.fr/opendata/jour` (XML) — cf. §13.

## 13. Solution de repli

| Priorité | Source | Mécanisme |
|---|---|---|
| 1 | data.economie.gouv.fr API v2.1 (`prix-carburants-quotidien`) | JSON, filtré géographiquement, paginé |
| 2 | data.economie.gouv.fr export JSON complet | Un seul appel, ~73k records, à traiter puis filtrer |
| 3 | donnees.roulez-eco.fr `/opendata/jour` (XML) | Téléchargement zip + parse XML (9 917 stations) |
| 4 | Données en cache SQLite | Dernier état connu, avec badge « données en cache (date) » |

La bascule se fait automatiquement par ordre de priorité ; chaque source produit
le même type de domaine (`StationPrice[]`) via l'abstraction `FuelPriceProvider`,
donc le domaine métier ne dépend jamais du format gouvernemental.

---

## Vérifications effectuées (2026-08-03, résultats réels)

| Vérification | Résultat |
|---|---|
| `records?limit=2` sur `prix-carburants-quotidien` | HTTP 200, `total_count: 73493`, enregistrement réel avec `prix_nom: Gazole`, `prix_valeur`, `prix_maj` |
| Export CSV complet | HTTP 200, en-têtes vérifiés (id, adresse, ville, cp, geom, « Prix Gazole mis à jour le », …) |
| Recherche `geo_distance` (Gennevilliers) | HTTP 200, `total_count: 152` stations à proximité |
| Dataset `prix-carburants-fichier-instantane-test-ods-copie` | HTTP 404 `NotFoundResource` (obsolète) |
| `donnees.roulez-eco.fr/opendata/jour` | HTTP 200, zip → XML 14,4 Mo, 9 917 stations, 32 082 prix, 13 663 horodatages distincts |
| `donnees.roulez-eco.fr/opendata/annee/2026` | HTTP 200, zip 22 Mo → XML 259 Mo |
| data.gouv.fr fiche dataset | `frequency: daily`, `license: fr-lo`, `last_update: 2026-08-02T06:05:39` |
