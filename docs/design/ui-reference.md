# Référence UI/UX — PouvoirAchat+

Brief de design partagé par tous les workers du chantier « rapprocher l'UI/UX de
PouvoirAchat+ ». Source : <https://pouvoirachatplus.fr/carte/> et l'app Android
`fr.pouvoirachatplus.pouvoirachat_plus`, capturées le 2026-08-04.

Captures dans `docs/design/reference/` :

| Fichier | Contenu |
| --- | --- |
| `ref-carte-mobile.png` | La carte, 390×844 (la cible principale) |
| `ref-carte-desktop.png` | La carte, 1440×900 |
| `ref-home-mobile-full.png` | La landing page, pleine hauteur |
| `before-home-mobile-full.png` | Notre app **avant** ce chantier |

**Regarde les captures avant d'écrire du CSS.** Le brief ci-dessous les décrit
mais ne les remplace pas.

## Ce qui change fondamentalement

Notre app est un **document** : un titre `<h1>`, des sections empilées, des
boutons rectangulaires bleus, et la carte reléguée en bas de page. La référence
est une **carte plein écran** sur laquelle flottent des contrôles en pilule.
C'est le seul écart qui compte vraiment : tout le reste en découle.

| | Avant (nous) | Cible (PouvoirAchat+) |
| --- | --- | --- |
| Écran principal | page qui défile, carte en bas | carte plein viewport, contrôles en overlay |
| Palette | bleu vif `#1d4ed8`, gris froids | crème/brun chaud + vert + terracotta |
| Formes | coins 8 px, rectangles | pilules `9999px`, cartes 12/16/24 px |
| Ombres | `0 1px 3px rgb(0 0 0/.08)` | ombres chaudes teintées brun |
| Prix | texte dans une liste | marqueurs-badges colorés sur la carte |
| Police | `system-ui` | `Inter` puis `system-ui` |

## Tokens exacts de la référence

Relevés dans le CSS live de `pouvoirachatplus.fr` — à reprendre **tels quels**,
ce sont les vraies valeurs, pas une approximation :

```css
:root {
  /* Vert — marque, CTA, « moins cher » */
  --green-500: #5E9962;
  --green-600: #4D8451;
  --green-700: #3D6B40;
  --green-800: #2E5231;

  /* Fonds chauds */
  --bg:         #FAF7F2;  /* fond de page crème */
  --surface:    #FFFDF9;  /* cartes, presque blanc chaud */
  --slate-100:  #F5F0EA;  /* survol, pistes de segmented control */

  /* Texte — bruns chauds, jamais de gris bleuté */
  --text-900: #352C24;
  --text-700: #6B5F53;
  --text-500: #8A7E72;
  --text-400: #ADA194;

  /* Terracotta — « plus cher », alertes douces */
  --terracotta:    #C4745B;
  --terracotta-bg: #FCF0EC;

  --lavender: #B8A9D4;    /* accent tertiaire, usage rare */

  /* Sémantique des marqueurs de prix */
  --marker-cheap:        var(--green-500);
  --marker-cheap-strong: var(--green-600);
  --marker-exp:          var(--terracotta);
  --marker-rupture:      var(--text-400);

  /* Rayons */
  --r-md: 12px;
  --r-lg: 16px;
  --r-xl: 24px;
  /* + pilule : 9999px, le rayon le plus fréquent de la référence */

  /* Ombres — teintées brun, jamais noir pur */
  --shadow-sm: 0 1px 3px rgba(53, 44, 36, .08), 0 1px 2px rgba(53, 44, 36, .06);
  --shadow-md: 0 4px 16px rgba(53, 44, 36, .1), 0 2px 6px rgba(53, 44, 36, .06);
  --shadow-lg: 0 12px 32px rgba(53, 44, 36, .16), 0 4px 10px rgba(53, 44, 36, .08);

  --grad-primary: linear-gradient(135deg, var(--green-700), var(--green-500));
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

Le mode sombre n'existe pas sur la référence — c'est à nous de le dériver (nous
avons déjà `html.dark` et un `DarkModeToggle`, on les garde). Dérive-le en
gardant la **chaleur** : bruns très sombres, pas de bleu-nuit.

## Anatomie de l'écran carte

De haut en bas, tout **flottant au-dessus** de la carte (voir
`ref-carte-mobile.png`) :

1. **Rangée d'en-tête** — pilules séparées posées sur la carte, pas une barre
   pleine largeur :
   - pilule de marque à gauche (logo rond + `PouvoirAchat+`, masquée en mobile
     étroit où seul le logo reste) ;
   - **champ de recherche** : grande pilule blanche, ombre `--shadow-md`, icône
     loupe à gauche, placeholder « Rechercher une ville, une adresse… » ;
   - pilule secondaire à droite (sélecteur de langue sur la référence) ;
   - **CTA vert** en pilule à l'extrême droite (`Installer l'app`).
2. **Segmented control carburant** — conteneur pilule blanc contenant les
   onglets `Gazole` / `SP95-E10` / `SP98` / `E85` / `GPLc`. L'onglet actif est
   une pilule verte pleine (`--green-600`, texte blanc) ; les inactifs sont du
   texte `--text-700` sans fond. Défile horizontalement en mobile.
3. **La carte** occupe tout le reste, tuiles OpenStreetMap standard.
4. **Marqueurs de prix** — c'est la signature visuelle. Badge rectangle très
   arrondi, fond blanc, ombre portée, contenant :
   - à gauche le **logo de l'enseigne seul** (Total, Avia, Intermarché, Esso…),
     recadré serré (tile 14 px, `object-fit: cover`) — les wordmarks
     panoramiques comme Total ne débordent pas du badge. Le nom de l'enseigne
     n'est pas répété dans le badge : il est dans la popup et le nom accessible
     (NFR-ACC-4) ;
   - à droite le **prix au format `2,319`** (virgule décimale, 3 décimales),
     en gras ;
   - la **couleur du liseré/du prix/de l'ergot encode l'attractivité du prix**
     en dégradé : vert = moins cher, terracotta = plus cher, gris = prix égal à
     la référence / rupture. Le fond du badge reste blanc (contraste AA sur les
     tuiles claires) ;
   - un « ergot » pointant vers le bas ancre le badge à la station, teinté de
     la même couleur.
5. **Clusters** — disques pleins terracotta avec le nombre de stations (`2`,
   `3`), texte blanc.
6. **Badge « ★ Recommandée »** — pilule verte pleine, texte blanc, étoile.
   C'est exactement notre notion de station recommandée : réutilise-le.
7. **Carte de légende** en bas à gauche — carte blanche arrondie, trois lignes
   « pastille + libellé » : `Moins cher` (vert), `Plus cher` (terracotta),
   `Prix périmé` (gris).
8. **Pilule compteur** en bas à gauche sous la légende — `⛽ 9 801 stations`.
9. **Contrôles flottants en bas à droite**, empilés : bouton rond véhicule,
   bouton rond de recentrage `◎`, puis le stack zoom `+` / `−`. Boutons ronds
   blancs, ombre `--shadow-md`, ≥ 44 px.

En desktop, la même composition : les overlays restent flottants et centrés en
haut, la carte prend toute la fenêtre.

## Ton éditorial

La référence tutoie et parle d'argent concret : « L'essence et le carburant
moins chers près de chez toi. », « Calcul du gain RÉEL après détour », « 3
étapes, 30 secondes », « Économise dès ton 1er plein ».

**Nous gardons notre vouvoiement et notre vocabulaire métier** (`CONTEXT.md`) :
station de référence, détour, économie nette, fraîcheur, tendance probable,
niveau de confiance. On copie la *forme* et la *densité d'information*, pas la
voix. Aucune formulation ne doit présenter une tendance comme une certitude, et
aucun prix ne doit être inventé — les invariants de `CONTEXT.md` priment sur
toute considération esthétique.

## Contraintes non négociables

Elles viennent de `CAHIER-DES-CHARGES.md` et de `CONTEXT.md`, et survivent au
redesign :

- cibles tactiles ≥ 44 px (NFR-RES-2) ;
- utilisable à ≤ 360 px de large (NFR-RES-1) ;
- contrastes WCAG AA en clair **et** en sombre (NFR-ACC-2) — le vert
  `--green-600` sur blanc et le blanc sur `--green-600` passent, mais vérifie
  chaque paire que tu introduis ; `--text-500`/`--text-400` sont réservés au
  texte secondaire de grande taille ;
- navigation clavier et `skip-link` conservés (NFR-ACC-1) ;
- rien qui recalcule la recommandation côté client (REC-2/D1) : le redesign est
  purement présentationnel ;
- la position précise n'est ni journalisée ni persistée (LOC-4).

## Primitives CSS disponibles

**Contrat d'interface** entre `assets/css/main.css` + `app.vue` (le socle) et
les composants/pages. Tout est global : rien à importer, rien à redéclarer.
Si tu as besoin d'un token ou d'une primitive qui manque, demande plutôt que de
réinventer une valeur en dur — c'est ce qui fait diverger l'UI.

### Règle d'or

**N'écris jamais une couleur, une ombre ou un rayon en dur.** Passe toujours par
un token. Les valeurs ci-dessous sont celles du thème clair ; `html.dark` les
remappe automatiquement, donc un composant qui n'utilise que des tokens est
correct en sombre sans une ligne de CSS supplémentaire.

### Tokens — couleurs de marque

| Token | Clair | Rôle |
| --- | --- | --- |
| `--green-500` | `#5E9962` | vert clair, décoratif |
| `--green-600` | `#4D8451` | vert de marque |
| `--green-700` | `#3D6B40` | vert foncé, fonds portant du texte blanc |
| `--green-800` | `#2E5231` | vert le plus foncé, survol / texte positif |
| `--brand` | `= --green-600` | usages **décoratifs** : liserés, pastilles, dégradés |
| `--grad-primary` | dégradé 135° `--green-700` → `--green-500` | en-têtes, splash |
| `--lavender` | `#B8A9D4` | accent tertiaire, usage rare |

> ⚠️ Le blanc sur `--green-600` ne fait que **4,44:1**, juste sous le seuil AA.
> Pour tout fond vert **portant du texte**, utilise `--accent` (= `--green-700`,
> 6,2:1), pas `--green-600`. `--brand` reste `--green-600` pour le décoratif.

### Tokens — fonds et texte

| Token | Clair | Sombre | Rôle |
| --- | --- | --- | --- |
| `--bg` | `#FAF7F2` | `#1C1815` | fond de page crème / brun très sombre |
| `--surface` | `#FFFDF9` | `#26211D` | cartes, pilules, overlays |
| `--slate-100` | `#F5F0EA` | `#322B26` | survol, pistes de segmented control |
| `--surface-raised` | `= --slate-100` | idem | alias historique |
| `--text-900` / `--text` | `#352C24` | `#F5F0EA` | corps de texte (13,4:1) |
| `--text-700` / `--text-muted` | `#6B5F53` | `#D6CCC0` | texte secondaire (6,1:1) |
| `--text-500` | `#8A7E72` | `#ADA194` | texte secondaire **de grande taille seulement** (3,9:1) |
| `--text-400` | `#ADA194` | `#8A7E72` | **jamais du texte en clair** (2,5:1) : pastilles, séparateurs, désactivé |
| `--border` | `#E7DFD5` | `#3D352E` | trait **décoratif** (séparateur, contour de carte) |
| `--border-strong` | `#90816C` | `#827567` | contour d'un **contrôle** (champ de saisie, `.btn-secondary`) — ≥ 3:1, WCAG 1.4.11 |

### Tokens — sémantique

| Token | Clair | Rôle |
| --- | --- | --- |
| `--accent` | `= --green-700` | fond d'un élément portant du **texte blanc** (bouton, onglet actif) |
| `--accent-hover` | `= --green-800` | survol de `--accent` |
| `--accent-contrast` | `#FFFFFF` | couleur du texte **sur** `--accent` (inversée en sombre) |
| `--accent-bg` | `#EDF3EC` | fond vert très pâle, états doux / encarts |
| `--positive` | `= --green-800` | texte « gain », « moins cher » |
| `--negative` | `= --terracotta-strong` | texte « perte », « plus cher » |
| `--focus` | `= --green-700` | anneau de focus clavier |
| `--terracotta` | `#C4745B` | **remplissage décoratif** (marqueur, cluster, liseré) |
| `--terracotta-strong` | `#9E4F38` | **texte** terracotta lisible (5,4:1) |
| `--terracotta-bg` | `#FCF0EC` | fond d'alerte douce |
| `--terracotta-fill` / `--terracotta-on-fill` | `#9E4F38` / `#FFFFFF` | paire fond + texte pour un bloc terracotta (5,8:1 clair, 6,6:1 sombre) |

> ⚠️ `--terracotta` seul ne porte **pas** de texte (blanc dessus : 3,5:1).
> Fond terracotta avec du texte → paire `--terracotta-fill` /
> `--terracotta-on-fill`.

### Tokens — marqueurs de prix

`--marker-cheap` (`--green-500`), `--marker-cheap-strong` (`--green-600`),
`--marker-exp` (`--terracotta`), `--marker-rupture` (`--text-400`).

Volontairement **identiques en clair et en sombre** : ils sont posés sur les
tuiles OpenStreetMap, qui restent claires quel que soit le thème.

Le dégradé des marqueurs quantifie l'attractivité du prix en 5 paliers
(`jflp-price-badge-tier-0` … `-4`), interpolation de `--terracotta-fill` (0, le
plus cher de la bande) vers `--green-700` (1, le moins cher) par pas de
25 % : terracotta → brun → neutre ocre → vert-olive → vert. La bande de prix
comparée est ±15 % autour de la station de référence (module pur
`domain/fuel-prices/priceAttractiveness`) ; la station de référence
elle-même reste neutre (`pill-outline`, elle est le point de comparaison).

Le **fond du badge porte la couleur** (demande produit) : chaque palier est
un fond plein avec du texte blanc (`--marker-tier-on-fill`, ≥ 5,8:1 sur tous
les paliers — WCAG AA), identique en clair et en sombre (posé sur les tuiles
OSM claires). Le logo d'enseigne garde sa pastille blanche, lisible sur tous
les paliers. La couleur n'est jamais le seul vecteur (NFR-ACC-4) : le prix
reste en texte dans le badge, et le nom accessible porte l'état.

Paliers (tokens `--marker-tier-0…4` — fond du badge + ergot) :

| Palier | Attractivité | Fond / ergot |
| --- | --- | --- |
| `-0` | 0 — le plus cher de la bande | `--marker-tier-0` (terracotta) |
| `-1` | ~0,25 | `--marker-tier-1` (brun) |
| `-2` | ~0,5 — prix ≈ référence | `--marker-tier-2` (neutre ocre) |
| `-3` | ~0,75 | `--marker-tier-3` (vert-olive) |
| `-4` | 1 — le moins cher de la bande | `--marker-tier-4` (vert) |

### Tokens — formes, ombres, plans

| Token | Valeur | Rôle |
| --- | --- | --- |
| `--r-md` | `12px` | petits blocs, encarts |
| `--r-lg` | `16px` | `.card`, `.overlay-card` |
| `--r-xl` | `24px` | grands panneaux, feuilles |
| `--r-pill` | `9999px` | pilules — **le rayon dominant** |
| `--shadow-sm` / `--shadow-soft` | ombre brune légère | blocs dans le flux |
| `--shadow-md` | ombre brune moyenne | tout ce qui **flotte sur la carte** |
| `--shadow-lg` | ombre brune profonde | feuilles modales, popups |
| `--font-sans` | `'Inter', system-ui, …` | Inter en tête, **non chargée depuis un CDN** (RGPD / PWA hors-ligne) |
| `--z-overlay` | `1100` | overlays de carte — **au-dessus des contrôles Leaflet (z-index 1000)** |
| `--z-modal` | `1150` | feuilles / dialogues |
| `--z-skip` | `1200` | skip-link |

> ⚠️ Leaflet monte ses propres contrôles à `z-index: 1000`. Tout overlay posé
> sur la carte **doit** utiliser `var(--z-overlay)`, sinon il passe dessous.

### Tokens — gouttières exposées par le shell

`app.vue` renseigne ces deux propriétés sur `.app-shell` ; elles sont héritées
par toute l'application (repli `0px` dans `main.css`) :

| Token | Route `/` (carte) | Autres routes | Sens |
| --- | --- | --- | --- |
| `--header-h` | `60px` | `0px` | place occupée **en haut** du viewport par le header flottant |
| `--nav-h` | `60px` ≤ 768 px, sinon `0px` | `0px` | place occupée **en bas** par la barre d'onglets flottante |

La page carte doit poser ses overlays **entre** les deux :

```css
.map-search { position: absolute; top: calc(var(--header-h) + 0.5rem); }
.map-legend { position: absolute; bottom: calc(var(--nav-h) + 0.5rem); }
```

### Classes utilitaires

| Classe | À quoi ça sert |
| --- | --- |
| `.card` | bloc de contenu dans le flux : `--surface` + bordure + `--r-lg` + `--shadow-sm` + padding `1rem` |
| `.overlay-card` | bloc qui **flotte sur la carte** : `--surface` + `--r-lg` + `--shadow-md`, sans bordure (légende, compteur, fiche station) |
| `.pill` | conteneur en pilule non cliquable (badge « ★ Recommandée », « ⛽ 9 801 stations », étiquette de marque) |
| `.pill-raised` | modificateur : ajoute `--shadow-md` à une `.pill` posée sur la carte |
| `.pill-accent` | modificateur : pilule verte pleine, texte `--accent-contrast` |
| `.pill-terracotta` | modificateur : pilule terracotta pleine (paire `--terracotta-fill` / `--terracotta-on-fill`) |
| `.pill-muted` | modificateur : pilule `--slate-100`, texte `--text-700` |
| `.pill-outline` | modificateur : pilule `--surface` cerclée de `--border` |
| `.badge-dot` | pastille ronde 10 px de légende ; la couleur vient de `color` sur le parent ou d'un `style="color: var(--marker-cheap)"` |
| `.btn` | base bouton : pilule, ≥ 44 px de haut, `font-weight: 600` |
| `.btn-pill` | même géométrie que `.btn`, sans la sémantique bouton (lien qui doit ressembler à un bouton) |
| `.btn-primary` | `.btn` + fond `--accent`, texte `--accent-contrast`, `--shadow-sm` ; gère `:hover` et `:disabled` |
| `.btn-secondary` | `.btn` + fond `--surface`, contour `--border-strong` ; gère `:hover` et `:disabled` |
| `.btn-ghost` | `.btn` sans fond, texte `--accent` ; survol `--slate-100` |
| `.fab` | bouton rond flottant sur la carte : 44 × 44 px, `--surface`, `--shadow-md` (recentrage `◎`, zoom `+`/`−`) |
| `.fab-accent` | modificateur : `.fab` vert, pour l'action primaire de la carte |
| `.segmented` | piste du segmented control : pilule `--surface` + `--shadow-md`, défilement horizontal sans barre visible |
| `.segmented-inset` | modificateur : variante sans ombre sur fond `--slate-100`, pour un segmented **dans une page** (pas sur la carte) |
| `.segmented-tab` | onglet inactif : ≥ 44 px, pilule transparente, texte `--text-700` |
| `.segmented-tab-active` | onglet actif : pilule `--accent` pleine, texte `--accent-contrast` |
| `.sr-only` | contenu réservé aux lecteurs d'écran (inchangé) |
| `.stations-area` | conteneur de la liste des stations (inchangé, ticket 011) |
| `components/BrandBadge.vue` | pastille d'enseigne : logo (décoratif, `alt=""`, recadré serré — `object-fit: cover`) ou repli initiale, nom en texte à côté — le nom réel de la station prime (NFR-ACC-4, ticket 021). Les logos servis par l'app (public/brands/, ex. TotalEnergies) priment sur celui de Wikimedia |

Markup attendu pour le segmented control (les rôles ARIA restent à la charge
du composant) :

```html
<div class="segmented" role="tablist">
  <button class="segmented-tab segmented-tab-active">Gazole</button>
  <button class="segmented-tab">SP95-E10</button>
</div>
```

### Comportements globaux déjà pris en charge

- `box-sizing: border-box` partout, `-webkit-text-size-adjust: 100%` ;
- `:focus-visible` : anneau `2px solid var(--focus)` avec `outline-offset: 2px`
  sur `a`, `button`, `input`, `select`, `textarea`, `[tabindex]` — **ne le
  neutralise pas** dans un composant ;
- `prefers-reduced-motion: reduce` coupe transitions et animations ;
- `a { color: var(--accent) }`, `body` sur `--bg` / `--text-900`.

### Ce que fait `app.vue`

Deux modes de shell, pilotés par `useRoute().path` :

- **`.shell-map`** (route `/`) — le header est `position: fixed`, donc **hors
  flux** : le shell fait `100dvh` et la page peut occuper tout le viewport. Le
  header est un simple conteneur `pointer-events: none` dont seuls les enfants
  captent les clics : le pan/zoom Leaflet passe entre les pilules.
- **`.shell-doc`** (`/profil`, `/favoris`, `/historique`) — header classique
  `sticky` dans le flux, restylé en pilules sur la palette chaude.

Navigation mobile sur la route carte (≤ 768 px) : la nav passe en **barre
d'onglets flottante en bas** (pas un bouton menu), pour rester à portée du
pouce et surtout pour **libérer tout le haut de l'écran** au profit de la
recherche et du segmented control carburant. Utilise `--nav-h` pour ne pas
passer dessous. En desktop, la nav rejoint la rangée flottante du haut, à
gauche : **le centre et la droite du bandeau sont libres** pour les overlays de
la page carte.

La marque « ⛽ Je fais le plein ou non ? » se réduit au pictogramme seul à
≤ 430 px ; le nom accessible reste porté par l'`aria-label` du lien.
