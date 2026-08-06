# Analyse de référence : carte des prix du carburant — PouvoirAchat+ (pouvoirachatplus.fr/carte/)

> Recherche documentaire (webfetch + lecture du bundle JS côté client). **Aucun code de l'app n'a été modifié.**
> Sources : page `/carte/` (SPA), `/`, `/carburants/*`, `/villes/`, `/prix-carburant/*` (sitemap), sitemap.xml, et le bundle `MapIsland.*.js` (composant carte Astro/React) + `map.css` + page officielle `prix-carburants.gouv.fr` (opendata).
> Date de collecte : 2026-08-06. Le contenu du bundle est daté (build) avec des prix relevés « 2026-06-23 » et des avis « avril/mai 2026 ».

---

## 1. Description générale du service

**PouvoirAchat+** est une appli (mobile native iOS/Android + web) dont la promesse est : *« l'essence et le carburant moins chers près de chez toi »*. Elle s'appuie sur les **prix officiels DGCCRF** (data.gouv.fr / prix-carburants.gouv.fr) pour ~9 800 stations françaises, en « temps réel ».

Point de différenciation revendiqué (et répété partout) : le **calcul du gain RÉEL après détour** — l'appli déduit le carburant brûlé pour l'aller-retour vers une station de l'économie brute, et affiche un **gain net en euros**. C'est exactement la thèse de notre app « Je fais le plein ou non ? » (recommandation prix carburants).

Structure produit (visible dans le sitemap) :
- **/carte/** — carte plein écran des prix (SPA, composant React/Astro hydraté côté client).
- **/carburants/** et `/carburants/{gazole,sp95-e10,sp98,e85,gplc}/` — pages SEO par carburant (prix moyen national, « le moins cher », FAQ).
- **/villes/** + `/prix-carburant/{departement}/` + `/essence/{ville}/` — pages SEO ville/département.
- **/guides/**, **/comparatif-application-carburant/**, **/aide-carburant/**, **/prix-essence/** — contenus éditoriaux + FAQ.
- Pages **presses/presse/partenaires**, **légal**, **status.html**, **telecharger/** (store badges).

Modèle économique : app **gratuite sans pub intrusive**, abonnement **Premium 2,99 €/mois ou 24,99 €/an** (coach IA, alertes illimitées, export CSV/PDF). Multi-langue : fr/en/es/it.

---

## 2. Fonctionnalités principales de la page /carte/

La page est une **SPA plein écran** (`position:fixed; inset:0`), un composant React (`MapIsland`) hydraté par Astro (`client:only`, donc rendu 100 % client). La carte est **MapLibre GL JS v4.7.1** (fond **OpenStreetMap** raster). Pas de Leaflet côté référence — notre app utilise Leaflet, ce qui n'empêche pas de reprendre les patterns UI.

Fonctionnalités observées dans le code (`Ux` = composant principal) :

1. **Recherche d'adresse/ville** (topbar). Appel à l'API nationale `api-adresse.data.gouv.fr/search/?q=…&limit=6` (débounce 250 ms, min 3 caractères, AbortController). Sélection → `flyTo` (zoom 12 si `municipality`, sinon 14). Résultats avec rôle `listbox`/`option`.

2. **Sélecteur de carburant** (barre « chips » pill, `role=tablist`/`aria-pressed`). FR : Gazole, SP95-E10, SP98, E85, GPLc. Pour ES/IT, la liste change (Gasóleo A, Gasolina 95/98, GLP, GNC, Metano…) — la même carte couvre **3 pays**.

3. **Affichage carte** :
   - **Clustering** des marqueurs (Supercluster, `radius:55, maxZoom:12`). Les clusters sont des pastilles vertes radiales avec **nombre de stations**, et clic = zoom jusqu'à `getClusterExpansionZoom(…)` (max zoom 16) via `easeTo`.
   - **Marqueurs stations personnalisés** : « bulle » avec **logo enseigne + prix**, couleur selon la valeur relative, pointe en bas, badge **★ Recommandée** (verte) sur la meilleure station. Données de prix formatées en **3 décimales** (`toLocaleString('fr-FR', {minimumFractionDigits:3})`).
   - **Recolorisation dynamique par quartiles** : la couleur de chaque marqueur est recalculée à chaque mise à jour à partir du **Q25 / Q75** des prix visibles : vert foncé = ≤ Q25 (moins cher), terracotta = > Q75 (plus cher), **ambre (#C9A24B)** = entre les deux, gris = rupture. (Fonction `Mf` + `Ex`.) — *NB : le marqueur est re-coloré en fonction des prix présents dans le viewport, pas en absolu.*
   - **Légende** : « Moins cher / Plus cher / Rupture » (3 pastilles), masquée ≤ 600 px.
   - **Zoom automatique** : `flyTo` sur géolocalisation au chargement (zoom 12) et sur la position utilisateur via FAB.
   - **Pays** FR/ES/IT : vue pays par défaut (`Rf[code]`, zoom 5.4, centre pays), sélecteur de langue en topbar.

4. **Géolocalisation** : `navigator.geolocation` au chargement (timeout 6 s, maxAge 5 min) + **FAB « localiser »** qui recentre sur la position.

5. **Données « light » + bbox** : deux stratégies d'hydratation (voir §3).

6. **Bottom sheet station** (clic marqueur) :
   - Grip + bouton fermer + logo enseigne + nom + adresse + **distance** (à vol d'oiseau haversine ou estimée).
   - **Prix du carburant** du jour + indication **« Maj il y a X min/h/j »** (relative time).
   - **Badge comparatif vs la station la plus proche** : « −X €/L moins cher », « +X €/L · plus cher », « Même prix que la plus proche », « Ta station la plus proche » — **ou gain net en €** (`net_saving`, `price_per_liter_vs_ref`) quand l'API éco a répondu.
   - Info « Ouvert 24/7 » si dispo.
   - **Actions : « Itinéraire »** (route) + **« Waze »** (deep link `waze.com/ul?ll=…`).

7. **Itinéraire / détour** :
   - Calcul de route via **OSRM public** `router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson`.
   - **Tracé de la route sur la carte** (2 couches : casing blanc + ligne verte #3D6B40) + `fitBounds` avec padding top/bottom (130/150) pour éviter les overlays.
   - **Bandeau d'itinéraire** en bas : « X km · Y min · vers {station} » + boutons **Google Maps** et **Waze** + fermer.
   - Fallback : si pas de position, ouvre Google Maps `dir/` directement.

8. **Réglages véhicule** (FAB 🚙) : modal « Mon véhicule » avec **consommation (L/100)** et **réservoir (L)**, stockés en `localStorage` (`pa_vehicle`). Ces valeurs servent au calcul **éco** côté serveur (RPC `get_stations_in_bbox_eco`).

9. **État/statut** : pill « **N stations** » + spinner pendant le chargement ; empty-state si 0 station.

10. **Rafraîchissement** : toutes les **5 minutes** (`Lx = 5*60*1000`) re-fetch de toutes les stations light ; re-fetch bbox à chaque `moveend` (debounce 350 ms).

11. **Install app** : bouton/modal CTA vers App Store / Google Play. Sélecteur de langue en topbar.

---

## 3. Données affichées

### Source
Prix officiels **DGCCRF** : `prix-carburants.gouv.fr` (open data, licence ouverte Etalab 2.0), flux instantané `https://donnees.roulez-eco.fr/opendata/instantane[_ruptures]` (maj toutes les ~10 min), flux quotidien `/jour`, archive annuelle `/annee`. Format XML ZIP. **NB : l'open data n'expose PAS le nom ni la marque des stations** — PouvoirAchat+ les enrichit lui-même (table `brand` en base, logos par enseigne).

### Backend de la carte
**Supabase** (projet `mujtrwvoigasytaghfwe.supabase.co`, clé anon embarquée dans le JS — publique, RLS côté serveur). 3 RPC PostgreSQL appelées par le client :

| RPC | Arguments | Usage |
|---|---|---|
| `get_stations_light` | `fuel_type_param`, `country_code_param` | Toutes les stations d'un pays (pagination par 1000, `order station_id`, `count: exact`, jusqu'à ~60 pages) — chargement initial |
| `get_stations_in_bbox` | `sw_lat, sw_lon, ne_lat, ne_lon, fuel_type_param, zoom_level, max_results:1000, center_lat, center_lon` | Stations dans le viewport (fallback et re-charge au déplacement) |
| `get_stations_in_bbox_eco` | bbox + `zoom_level, max_results:300, center_*, fuel_type_param, tank_liters, consumption, wear_per_km` | **Variante « éco » (zoom ≥ 11)** qui renvoie aussi `net_saving`, `price_per_liter_vs_ref`, `is_reference`, `is_recommended` — calcul côté serveur |

### Champs d'une station (clients Supabase)
`station_id`, `latitude`, `longitude`, `brand`, `name`, `price`, `is_rupture`, `rupture_type`, `services`, `is_highway`, `is_24_7`, `country_code`, `address`, `postal_code`, `city`, `updated_at`, `distance_km`, et pour l'éco : `net_saving`, `price_per_liter_vs_ref`, `is_reference`, `is_recommended`.

### Données exposées au marché (autres pages)
- **Prix moyens par carburant** (page /carburants/, relevés datés) : Gazole 1,914 €, SP95-E10 1,905 €, SP98 2,010 €, E85 0,842 €, GPLc 1,064 € (moyenne + « le moins cher »).
- Pages **ville/département** : classement des stations par prix réel, ruptures signalées.

### Logos enseignes
Répertoire `https://www.prix-carburants.2aaz.fr/img/brands/{slug}.png` avec une **table de correspondance enseigne → slug** (total→total, e.leclerc→eleclerc, carrefour contact→carrefourcontact, systéme u→systemeu, indépendant→independant, etc.). `img onerror` → fallback sans logo.

### Attribution
Tuiles : © OpenStreetMap (attribution compacte MapLibre). Cartes/fonds non payants. OSRM public (usage raisonnable). api-adresse.data.gouv.fr (État). Waze/Google Maps = deep links.

---

## 4. UX / UI

### Structure de la page (z-index)
1. `.map-canvas` (fond).
2. **Topbar** (z 25, max-width 920, safe-area) : brand logo → **recherche** (flex:1) → sélecteur langue → bouton « Installer l'app ».
3. **Barre carburant** (z 22) : pill flottante centrée, chips scrollables horizontalement (masque scrollbar).
4. **Légende** (z 18) : bas-gauche, masquée ≤ 600 px.
5. **FABs** (z 22, droite) : 🚙 véhicule (bottom 152), ◎ localiser (bottom 96).
6. **Pill de statut** (z 22) : bas-gauche, « {n} stations » + spinner.
7. **Empty-state** centré.
8. **Route banner** (z 24, bottom) et **Bottom sheet** station (z 30/31) + backdrop.
9. **Modals** (z 60) : véhicule, install app.

### Design system
- Palette « terre » chaleureuse : fond `#FAF7F2`, surface `#FFFDF9`, texte `#352C24` (marron), verts enseigne `#5E9962→#2E5231`, **terracotta** `#C4745B` (mise en garde/plus cher), ambre `#C9A24B` (médian), lavande `#B8A9D4` (accents). **Mode sombre** complet via `prefers-color-scheme` (fond `#211A14`).
- Typo **Inter** (Google Fonts), tabular-nums pour les prix.
- **Formes pill** partout (boutons, chips, search, status pill, FAB) + coins arrondis `12/16/24px`, ombres douces `--shadow-*`, **`safe-area-inset`** partout (notch/barre iOS), dégradé vert primary `linear-gradient(135deg, green-700, green-500)`.
- Micro-animations : slideUp du sheet (200 ms), fade des modals, spinner rotatif.

### Composants remarquables
- **Marqueur = « bulle prix »** avec logo + prix + pointe (fil d'Ariane de la station) — très lisible, contrairement à un simple pin.
- **Recolorisation par quartile** (vert/ambre/terracotta) : la légende devient un repère statistique, pas juste décoratif.
- **Cluster** simple mais efficace : pastille verte avec compteur, clic = zoom sur le groupe (expansion). Pas de libellé prix sur les clusters.
- **Bottom sheet** avec comparatif prix vs station proche + fraîcheur + route.
- **Bandeau d'itinéraire** avec stats (km, min) et actions externes.
- Sélecteur langue = **changement de pays** (carte + carburants) — un seul composant, 3 datasets.

### Accessibilité notable
- `role="dialog"` + `aria-label` sur sheets/modals, `role="listbox"/"option"` sur résultats de recherche, `aria-pressed` sur chips carburant, `aria-label` sur les marqueurs (`{enseigne} {prix} €`), `.sr-only` pour le h1, focus visible sur les contrôles MapLibre.
- La couleur n'est **pas** le seul vecteur : le prix est toujours affiché en texte, la rupture affiche `---`.
- Label/`for` sur les champs véhicule.
- NB : la légende est masquée en mobile (`aria-hidden`), les FABs n'ont pas de label texte visible (icônes emoji + aria).

### Points d'UX notables
- Géolocalisation au premier chargement + recentrage.
- Recherche nationale (API adresse de l'État, gratuite, sans clé).
- Fresque « Maj il y a X min » rassure sur l'actualité des prix.
- La distance affichée dans le sheet et le badge gain net/€/L répondent à « est-ce que ça vaut le coup d'aller là-bas ? » — exactement notre usage.

---

## 5. Idées réutilisables pour « Je fais le plein ou non ? »

Alignées sur notre stack (Nuxt 4, Leaflet plein écran, prix DGCCRF, bottom sheet, logique pure `calculateFuelRecommendation`).

### Facile (faible effort, fort impact)
1. **Marqueurs « bulle prix » avec enseigne + prix + pointe** (pattern `.pa-marker`). Nous avons déjà `BrandBadge.vue` + marqueurs Leaflet ; ajouter une pointe CSS et la couleur prix. Notre app est centrée sur la recommandation — le marqueur de la station **recommandée** peut porter un badge ★ (déjà implémenté côté référence).
2. **Légende « Moins cher / Plus cher / Rupture »** en surimpression bas-gauche, masquée sur mobile (< 600 px) — petit composant, gros gain de lisibilité.
3. **Pill de statut « N stations » + spinner** pendant le chargement, et **empty-state** (0 station) centré — nous avons déjà des composants loading/error/insufficient ; compléter par le compteur.
4. **Formatage prix à 3 décimales + tabular-nums** (au lieu de 2) : c'est le format des prix à la pompe (1,729 €/L), déjà notre domaine.
5. **Fresque temporelle relative « Maj il y a X min »** dans le bottom sheet (déjà quasi en place, à uniformiser).
6. **Recherche adresse via `api-adresse.data.gouv.fr`** (déjà en place dans `server/lib/geocode.ts` probablement) avec débounce + `listbox` : à verrouiller côté tests e2e.
7. **Deep links** Google Maps / Waze / OSRM-route depuis le sheet (composant `DirectionsLinks.vue` existe déjà).

### Moyenne
8. **Recolorisation par quartiles (Q25/Q75)** des marqueurs selon les prix du viewport, avec ambre pour la médiane. Nécessite de garder l'ensemble des prix du viewport en mémoire (léger) et de recolorer à `moveend`/zoomend. Dans notre cas, la **recommandation** reste le marqueur distinct (vert/★) — le quartile sert à donner du contexte « moins cher/plus cher » autour.
9. **Clustering** (Supercluster côté référence) : nous avons déjà `buildStationClusters` / `clusterRadiusKmForZoom` — aligner le comportement clic = zoom d'expansion + compteur.
10. **Route + bandeau « X km · Y min »** : OSRM public est gratuit mais à usage raisonnable ; à envisager côté serveur (Nitro) pour éviter l'exposition de la clé/rate-limit et pour masquer les appels. Le tracé de route Leaflet (couche GeoJSON + casing blanc) est un pattern réutilisable. Attention : le détour n'est pas le cœur de notre recommandation, à garder en complément.
11. **Réglages véhicule (conso + réservoir)** en localStorage, réinjectés dans le calcul (l'API éco de la référence prend `tank_liters`, `consumption`, `wear_per_km`). Notre `calculateFuelRecommendation` peut absorber ces paramètres.
12. **Pagination par lots + `count: exact`** pour charger toutes les stations d'un pays (1 000 par page, 60 pages max) — utile si on veut un cache global des prix DGCCRF côté serveur (notre contexte : SQLite + Drizzle + job de synchro).

### Difficile / à moyen terme
13. **Bottom sheet « comparatif vs station la plus proche »** : la référence compare la station cliquée à la station **référence** (la moins chère/la plus proche) et affiche `net_saving` (€) ou `price_per_liter_vs_ref`. C'est le cœur de notre valeur ajoutée ; notre module pur `calculateFuelRecommendation` + un RPC SQL (bbox + calcul net) permettraient le même détail. À faire en gardant la logique **côté domaine pur** (pas de dépendance Nuxt/SQLite dans le module métier), et le calcul SQL en bonus perf.
14. **Recoloration/agrégat éco serveur** (`get_stations_in_bbox_eco` qui renvoie `is_recommended`, `net_saving`…) : nécessite un index spatial + calcul en SQL. Notre stack (SQLite, Nitro) peut exposer un endpoint équivalent ; la recommandation reste calculée par `calculateFuelRecommendation` (module pur) côté serveur.
15. **Sélecteur langue ↔ pays (FR/ES/IT)** : le site multi-pays avec données ouvertes étrangères (Espagne/Italie) est un vrai produit à part entière ; pas prioritaire pour nous.

---

## 6. À ÉVITER (anti-patterns)

1. **Imbriquer la logique métier dans le client** : la carte de référence charge **tout** côté client et ne garde qu'une couche serveur opaque (RPC). Chez nous, `calculateFuelRecommendation` doit rester **module pur** (règle CAHIER-DES-CHARGES) — ne jamais réimplémenter le calcul de recommandation dans un composant Vue ni dans du SQL en dur, et ne pas mettre de logique métier dans le JS du bundle.
2. **Clé Supabase anon publique dans le bundle client** : acceptable seulement si RLS (lignes non exposées) ; chez nous → **jamais de secret côté client**, on passe par Nitro/`$fetch` server routes.
3. **Clé/URL `2aaz.fr` pour les logos enseignes** : dépendance à un domaine tiers non officiel. Préférer notre propre mapping enseigne (ou servir les logos nous-mêmes), avec `onerror` de repli.
4. **Charger ~10 000 stations en un seul `fetch` par lots de 1 000 sur le client à l'init** : lourd en réseau (60 requêtes) et en mémoire. Chez nous, **recherche bbox côté serveur** + cache (SQLite) à la demande, plutôt qu'un chargement global côté client.
5. **Récupérer le pays entier puis re-fetch au moindre `moveend`** : risque de « thundering herd » (le code débounce 350 ms mais refetch à chaque pan). Éviter le refetch systématique : privilégier les **données déjà en cache** + refetch seulement si le viewport a bougé « significativement » ou après un temps minimal.
6. **Surcharge du bottom sheet** : prix + comparaison + fraîcheur + distance + 24/7 + 2 actions = beaucoup pour un premier niveau. Garder l'essentiel (prix, gain net, action) et masquer le détail derrière un « plus d'infos ».
7. **Masquer la légende en mobile** sans la remplacer : la couleur devient alors ambiguë. Si on masque, remplacer par un `aria-hidden` assumé + prix en texte (déjà notre pratique).
8. **Deep link Waze/Google Maps en fallback** quand la géoloc est refusée : UX dégradée. Mieux : garder le sheet consultable sans route, ou proposer une recherche adresse.
9. **Overlay empilés** (topbar + fuel-bar + FABs + legend + pill + sheet) : risque de chevauchement sur petits écrans ; le référence gère avec `safe-area` et un padding du sheet, mais il faut tester nos breakpoints (600/720/860 px) et surtout **les hauteurs** (pas seulement les largeurs).
10. **Traductions et unités mélangées** (fr/en/es/it, km vs m, 3 décimales) : source de bugs de format. Centraliser le formatage (déjà fait dans nos `utils`), et ne pas introduire de i18n partielle.

---

## Annexe A — Endpoints & ressources techniques (référence)

- Carte (SPA) : `https://pouvoirachatplus.fr/carte/` — HTML = `<astro-island client:only>`, bundle `/_astro/MapIsland.*.js`.
- Tuiles de fond : `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (raster, attribution © OpenStreetMap).
- Géocodage : `https://api-adresse.data.gouv.fr/search/?q={q}&limit=6` (ÉTAT, gratuit, sans clé).
- Routing : `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson` (public).
- Backend stations : Supabase `https://mujtrwvoigasytaghfwe.supabase.co`, RPC : `get_stations_light`, `get_stations_in_bbox`, `get_stations_in_bbox_eco`.
- Logos enseignes : `https://www.prix-carburants.2aaz.fr/img/brands/{slug}.png` (tiers non officiel).
- Deep links : `https://waze.com/ul?ll={lat},{lon}&navigate=yes` ; `https://www.google.com/maps/dir/?api=1&destination={lat},{lon}`.
- Données officielles (source primaire DGCCRF) : `https://donnees.roulez-eco.fr/opendata/instantane[_ruptures]` (maj ~10 min), `/jour`, `/annee` — XML ZIP, licence **Etalab-2.0** ; ne contient **pas** les noms/marques des stations.
- Données complémentaires open data : départs/communes via `api-adresse.data.gouv.fr` ; API officielle prix-carburants.gouv.fr = site de consultation (pas d'API JSON publique) — les flux roulez-eco sont la source machine.

## Annexe B — Champs JSON renvoyés par l'API Supabase (d'après le bundle)

`station_id`, `latitude`, `longitude`, `brand`, `name`, `address`, `postal_code`, `city`, `country_code`, `price`, `updated_at`, `is_rupture`, `rupture_type`, `is_highway`, `is_24_7`, `services`, `distance_km` (calcul client haversine en l'absence de position), et sur la variante éco : `net_saving`, `price_per_liter_vs_ref`, `is_reference`, `is_recommended`.

## Annexe C — Constantes remarquables du code client (référence)

- `Lx = 5 * 60 * 1000` → refetch complet toutes les 5 min.
- `Dx = 11` → zoom seuil à partir duquel l'API « éco » est utilisée (recommandation serveur).
- Débounce recherche : 250 ms ; min 3 caractères ; `limit 6`.
- Géoloc : `enableHighAccuracy:false, timeout:6000, maximumAge:300000`.
- Débounce refetch bbox au moveend : 350 ms.
- Cluster : `radius:55, maxZoom:12, maxZoomClic 16` ; taille marker prix : 40/48/56/64 px selon le nombre de stations (<10 / <50 / <200 / ≥200).
- `tank` par défaut 50 L, conso 6,5 L/100, usure 0,05 €/km (values `ps`).
- Prix : `toLocaleString('fr-FR', {minimumFractionDigits:3, maximumFractionDigits:3})` ; distance : `<1 km → "X m"`, sinon `X km` (1 décimale).
