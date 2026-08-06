# PouvoirAchat+ — Analyse technique de la carte des prix carburant

> Analyse statique réalisée le 2026-08-06 sur `https://pouvoirachatplus.fr/carte/`
> (HTML + bundles `/_astro/MapIsland.D6UQkEfP.js`, `/_astro/client.DrE9CFQR.js`,
> `/_astro/index.CVf8TyFT.js`) et pages connexes (`/telecharger/`, `sitemap.xml`).
> Aucun code de l'app n'a été modifié.
>
> Contexte croisé : `docs/research/fuel-data-source.md` (données DGCCRF officielles
> déjà consommées par « Je fais le plein ou non ? »).

## Résumé exécutif

La carte de PouvoirAchat+ **n'appelle pas directement l'API DGCCRF / data.gouv.fr**.
Les prix proviennent de leur **propre backend Supabase (Postgres + PostgREST)**,
alimenté en interne (probablement) à partir du jeu officiel DGCCRF (le site le
revendique : « prix officiels data.gouv.fr »). Les données sont récupérées côté
client par **fonctions RPC Postgres** (`get_stations_in_bbox`, `get_stations_in_bbox_eco`,
`get_stations_light`). La mécanique carte est **MapLibre GL JS v4.7.1** (pas Leaflet),
avec **tuiles raster OSM**, **marqueurs DOM** et **clustering supercluster client-side**.
Aucun heatmap. Un **moteur de recommandation « eco » tourne côté serveur** dans
leur Postgres (indice « gain réel après détour »), non réutilisable tel quel — on a
déjà l'équivalent en module pur (`calculateFuelRecommendation`).

**Point clé pour notre app : rien chez PouvoirAchat+ n'est une source de données
réutilisable** (backend privé, aucune clé publique). En revanche les **patterns de
rendu carte** (bbox-fetch, clustering, quartiles de prix, zoom-gate) sont directement
transposables dans une carte Leaflet/MapLibre de notre app.

---

## 1. Stack et bibliothèques détectées (côté `/carte/`)

| Couche | Technologie | Preuve |
|---|---|---|
| Génération de site | **Astro** (SSG) + **React** island `client:only` | `<astro-island component-url="/_astro/MapIsland.D6UQkEfP.js" ... client="only" opts='{"name":"MapIsland","value":"react"}'/>`, script d'hydratation Astro |
| Rendu carte | **MapLibre GL JS v4.7.1** (BSD-3-Clause) | Header du bundle : `@license 3-Clause BSD ... github.com/maplibre/maplibre-gl-js/blob/v4.7.1/LICENSE.txt` |
| Clustering client | **supercluster** (embarqué) | `new f_({radius:55,maxZoom:12,map:...clusterProperties...})`, `getClusterExpansionZoom`, `getLeaves`, `getClusterChildren` |
| Backend données | **Supabase** (PostgREST + Auth client) | `https://mujtrwvoigasytaghfwe.supabase.co`, `supabaseUrl`/`supabaseKey`, `auth:{persistSession:false}`, `rest.v1`, `rpc(...)` |
| Géocodage (recherche) | **api-adresse.data.gouv.fr** (Etalab, gratuit, sans clé) | `https://api-adresse.data.gouv.fr/search/?q=${...}&limit=6` |
| Calcul d'itinéraire/ETA | **OSRM public** `router.project-osrm.org` | `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson` |
| Navigation | deep-links **Waze** et **Google Maps** | `https://waze.com/ul?ll=...&navigate=yes`, `https://www.google.com/maps/dir/?api=1&destination=...` |
| Logos enseignes | Mirror tiers **2aaz.fr** | `https://www.prix-carburants.2aaz.fr/img/brands/{brand}.png` |
| i18n | fr/en/es/it (React context) | Dictionnaires `pt(...)`, sélecteur de langue |
| Polices | Google Fonts (Inter) | `<link href=".../css2?family=Inter...">` |
| Mobile | App iOS/Android (Capacitor-like) | liens App Store / Google Play |

**Bibliothèques ABSENTES** : pas de Leaflet, pas de maplibre-react wrapper
(composants React maison autour de l'API MapLibre), pas de heatmap (pas de
`heatmap-layer`), pas de décodeur PMTiles/MVT vectoriel (source = raster PNG OSM).

## 2. Source(s) de données utilisées par la carte

### 2.1 Backend propriétaire Supabase (source réelle du client)

- Base : `https://mujtrwvoigasytaghfwe.supabase.co` (PostgREST). Clé publique `anon`
  (JWT `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…`) embarquée dans le bundle — **publique,
  lisible par n'importe qui**, mais elle ne sert qu'à ce projet.
- Trois fonctions RPC (toute la logique serveur vit dans Postgres) :

| RPC | Paramètres | Retour (champs consommés) |
|---|---|---|
| `get_stations_light` | `fuel_type_param`, `country_code_param` | `station_id, brand, latitude, longitude, price, is_rupture` (paginé par `range`, jusqu'à 60 pages × 1000) |
| `get_stations_in_bbox` | `sw_lat, sw_lon, ne_lat, ne_lon, fuel_type_param, zoom_level, max_results:1000, center_lat, center_lon` | idem + filtre géographique dans le viewport |
| `get_stations_in_bbox_eco` | bbox + `max_results:300, tank_liters, consumption_l, wear_per_km` | + `net_saving, price_per_liter_vs_ref, distance_km, is_recommended` |

- **`get_stations_in_bbox_eco` est le cœur du produit** : le calcul du « gain réel
  après détour » (détour déduit de la conso) est fait **côté serveur Postgres**.
  On ne voit que les sorties (`net_saving`, `is_recommended`), pas la formule.
- Format : JSON (PostgREST), enregistrements plats station × carburant déjà
  dénormalisés pour le carburant actif (`fuel_type_param`).

### 2.2 Origine amont des données (revendiquée)

- Footer du site : « Données prix carburant : **data.gouv.fr** ».
- Page `/telecharger/` : « 9 800 stations · **prix officiels data.gouv.fr** ».
- Valeurs possibles de `fuel_type_param` : `gazole, e10, sp95/sp98, e85, gplc`
  (libellés UI : Gazole, SP95-E10, SP98, E85, GPLc) — **mêmes carburants (ids 1..6)
  que le flux DGCCRF** documenté dans `fuel-data-source.md`.
- C'est donc le même jeu de données officiel (DGCCRF, licence ouverte `fr-lo`),
  ré-ingéré par leurs soins. Le pipeline d'ingestion (fréquence, upsert) est **privé**.

### 2.3 Pas de flux téléchargeable / stats publiques

- Le `sitemap.xml` ne montre que des pages SEO (`/prix-carburant/{dep}-{num}/`,
  `/essence/{ville}/`, `/carburants/…`). **Aucun endpoint d'export, de stats ou de
  flux de données public.** Les pages département/ville sont du contenu statique.
- Les seuls appels « ouverts » réutilisables sont le **géocodeur Etalab**
  (api-adresse.data.gouv.fr) et le **router OSRM public** — tous deux non liés à
  leur backend.

## 3. Mécanique d'affichage de la carte

- **Style** : objet inline (pas de style.json distant) — `version:8`, une seule
  source `osm` de type `raster` pointant sur `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  `tileSize:256`, attribution `© OpenStreetMap` ; une couche raster `osm`.
- **Zoom-gate (anti-charge)** : les stations détaillées ne sont chargées que si
  `zoom >= 11` (`Dx=11`). En dessous, on reste sur les **clusters nationaux** issus
  du chargement complet (`get_stations_light`).
- **Marqueurs** : `new maplibre.Marker({element})` en DOM (pas de couche `symbol`).
  Élément personnalisé : pointeur + badge prix (`.pa-marker-price`, valeur en € ou
  `---` si rupture). Couleur selon **quartiles de prix** : `cheap = Q25`, `exp = Q75`,
  `hasSpread = Q75-Q25 >= 0.01` (sinon ambre par défaut) ; vert « moins cher »,
  terracotta « plus cher », gris « rupture ». Mise à jour incrémentale par `station_id`
  avec signature (évite de recréer tous les marqueurs à chaque pan).
- **Clustering** : supercluster côté client (`radius:55, maxZoom:12`) avec
  `clusterProperties` agrégés (`priceSum`, `priceCount` pour afficher la moyenne).
  Cercle cluster + compteur ; clic → `getClusterExpansionZoom(id)` → `easeTo`.
- **Rafraîchissement** : `moveend`/`zoomend` → `get_stations_in_bbox` (debounce
  350 ms pour l'éco) ; **`setInterval` toutes les 5 min** (`Lx=5*60*1e3`) →
  `get_stations_light` (rafraîchit prix/liste). Pas de temps réel au sens strict.
- **Fiche station** : pas de `Popup` MapLibre — **bottom-sheet** React (`Bx`) avec
  détail (adresse, distance, gain vs référence, badge « station de référence »).
  Bouton itinéraire → **OSRM** → trace dessinée en couche GeoJSON (`route-casing`
  blanc 9px + `route-line` vert `#3D6B40` 5px), `fitBounds`, affichage distance/durée.
- **Recherche** : input → api-adresse.data.gouv.fr (debounce 250 ms, min 3 chars),
  sélection → `flyTo` (zoom 12 si commune, 14 sinon).
- **Localisation** : `navigator.geolocation` au chargement → `flyTo` zoom 12.
- **Légende** affichée hors mode chargement : moins cher / plus cher / rupture.
- **Pas de heatmap** : la densité est gérée par le clustering seul.

## 4. Éléments réutilisables dans notre stack (Nuxt 4 + Leaflet + DGCCRF)

Les données de PouvoirAchat+ ne sont **pas réutilisables** (backend privé). Ce qui
l'est, ce sont les **patterns** — tous indépendants de leur backend.

| Élément | Réutilisation dans « Je fais le plein ou non ? » | Effort |
|---|---|---|
| **Rendu carte (MapLibre vs Leaflet)** | On a déjà Leaflet dans la stack cible. Les patterns ci-dessous sont framework-agnostiques (l'API MapLibre = Leaflet-like). Garder Leaflet : pas de migration nécessaire. | ~0 |
| **Tuiles OSM raster** | Identique : `tile.openstreetmap.org/{z}/{x}/{y}.png` (attribution ODbL/©OSM obligatoire). Alternative tuiles IGN (ign_scan/ortho) ou VectorTiles si besoin de style premium. | faible |
| **Zoom-gate (charger les points seulement si zoom ≥ seuil)** | Très pertinent : avec ~9 800 stations, ne pas charger la France entière. Branché sur `geo_distance`/bbox côté Nitro. | faible |
| **Bbox-fetch + refetch sur moveend + debounce** | Notre endpoint Nitro peut accepter `bbox`/`center`+`radius` (API Opendatasoft supporte `geo_distance`). Pattern identique, debounce 300-400 ms. | moyen |
| **Clustering client (supercluster)** | Disponible en Vue (`@turf/clusters-dbscan` ou `supercluster` pur). On clustera nos candidats (souvent < 50) — utile surtout pour la vue nationale. | faible |
| **Color-code par quartiles (Q25/Q75, seuil d'écart 0.01 €)** | Réutilisable tel quel pour teinter les marqueurs « moins cher/plus cher ». Peut enrichir l'affichage des sorties de `calculateFuelRecommendation`. | faible |
| **Rafraîchissement 5 min + `prix_maj`** | On a déjà la stratégie (synchro 2 h, `prix_maj` horodaté). Le 5 min de PouvoirAchat+ n'apporte rien (données régénérées ~1×/jour à 06:05 UTC, cf. `fuel-data-source.md` §5). Ne PAS copier le 5 min. | — |
| **Géocodage api-adresse.data.gouv.fr** | Réutilisable directement (open data Etalab, sans clé, adapté « ma ville »). | faible |
| **Itinéraire/ETA OSRM** | Optionnel MVP+. Pas d'engagement de service (démo publique) ; à remplacer par un OSRM auto-hébergé ou un provider si on industrialise. | moyen+ |
| **Badge « station de référence » + gain net** | On a déjà la notion : `calculateFuelRecommendation` produit la recommandation + économie. Afficher la station recommandée en surbrillance sur la carte. | faible |
| **Logos enseignes (2aaz.fr)** | ⚠️ Ne PAS dépendre de ce mirror tiers. Le flux officiel ne fournit pas l'enseigne de façon fiable (`fuel-data-source.md` §7). Dériver un libellé ou ignorer hors MVP. | — |
| **Moteur « eco » serveur (formule cachée)** | Non réutilisable (logique noyée dans Postgres, invisible). On a déjà le meilleur équivalent : module métier **pur** `calculateFuelRecommendation`, testable en TDD, sans dépendance HTTP. | — |

**Verbatim d'intégration conseillé pour l'app** : un composant carte Vue/Leaflet
(Vue-Leaflet) qui consomme notre endpoint Nitro `/api/station-prices` avec paramètres
`center`/`radius` (ou bbox) + `fuelType`, cluster supercluster, couleur par écart
au prix de référence, et un marqueur surligné pour la station recommandée. Toute la
logique de recommandation reste dans `calculateFuelRecommendation` (invariant,
`fuel-data-source.md`).

## 5. Points de vigilance

1. **Licence / ToS**
   - Tuiles OSM : attribution obligatoire (`© OpenStreetMap` contributors, ODbL).
     Usage de `tile.openstreetmap.org` soumis à leur **politique d'usage**
     (pas de bulk, User-Agent honnête, pas de revente) ; prévoir un fournisseur de
     tuiles (IGN, Stadia, ou VectorTiles) pour la production.
   - Données DGCCRF : licence ouverte `fr-lo` (Etalab), mention de source et date
     obligatoires — déjà géré dans `fuel-data-source.md`.
   - **Backend Supabase de PouvoirAchat+ : ne pas interroger/scraper** (backend privé
     d'un concurrent, aucune API publique documentée, risque légal et ToS). On ne
     consomme que des sources ouvertes officielles.
   - Mirror de logos `2aaz.fr` : propriété de tiers, sans garantie de licence/fiabilité
     → à éviter dans notre app.
2. **Latence / fiabilité**
   - Les 3 RPC Supabase + le rendu 5 min de la liste complète (jusqu'à 60 appels
     paginés de 1000) sont lourds. Pour nous : la pagination Opendatasoft (~735 appels
     de 100) doit rester **côté job Nitro**, pas côté client.
   - OSRM public : pas de SLA, latence variable, à reléguer optionnel.
   - Les pages « temps réel » de PouvoirAchat+ reposent sur les **mêmes données
     quotidiennes DGCCRF** (régénérées ~06:05 UTC) — pas d'avantage de fraîcheur.
     Notre cadence 2 h / 24-48 h de fraîcheur (cahier des charges) est cohérente.
3. **Correctness des données**
   - `price` absent ou `is_rupture` → marqueur `---` (mêmes règles que nos
     « données insuffisantes » / exclusions).
   - Quartiles calculés sur les prix **du viewport** (pas nationaux) → couleur
     relative à l'écran ; comportement à documenter côté produit.
4. **Confidentialité** : géolocalisation utilisateur (consentement `navigator.geolocation`),
   profils véhicule en `localStorage` (`pa_vehicle`, défauts conso 6.5 L/100, réservoir
   50 L, usure 0.05 €/km) — mêmes choix que notre localStorage.
5. **Obsolescence** : analyse faite à partir de bundles Astro minifiés (2026-06) ;
   les noms de RPC/tables peuvent changer. Ré-analyser si besoin d'une intégration
   future.

---

## Vérifications effectuées (2026-08-06)

| Vérification | Résultat |
|---|---|
| HTML `https://pouvoirachatplus.fr/carte/` | Astro island React `client:only`, 1 seul script carte `MapIsland.D6UQkEfP.js` + `client.DrE9CFQR.js` |
| Header bundle `MapIsland` | MapLibre GL JS **v4.7.1** (BSD-3), supercluster, supabase-js embarqués |
| Endpoints réseau dans le bundle | Supabase `mujtrwvoigasytaghfwe.supabase.co`, api-adresse.data.gouv.fr, router.project-osrm.org, tile.openstreetmap.org, 2aaz.fr, waze.com, google maps |
| RPC Supabase | `get_stations_light`, `get_stations_in_bbox`, `get_stations_in_bbox_eco` (avec params tank/conso/usure) |
| `get_stations_in_bbox_eco` retour | `net_saving`, `price_per_liter_vs_ref`, `distance_km`, `is_recommended` |
| Style de la carte | Objet inline `version:8`, source raster OSM unique, attribution ©OSM |
| Clustering | `supercluster` radius 55, maxZoom 12, `priceSum`/`priceCount`, `getClusterExpansionZoom` |
| Zoom-gate | `zoom < 11` → pas de fetch bbox |
| Refresh | `setInterval` 5 min sur `get_stations_light` ; refetch bbox sur `moveend`/`zoomend` |
| `sitemap.xml` | Aucun flux/export public ; seulement pages SEO |
| `/telecharger/` | « 9 800 stations · prix officiels data.gouv.fr » — confirme l'origine DGCCRF |
