// tests/e2e/station-map.spec.ts — Carte OpenStreetMap (ticket 012, spec §4
// step 4). Parcours : recherche par ville, puis la carte se monte avec un mock
// API /api/stations (les mêmes données que la liste — pas de double appel).
// On vérifie la présence du conteneur de carte et l'accessibilité de base ;
// on NE vérifie pas le chargement des tuiles réseau (les tuiles OSM peuvent
// être indisponibles hors-ligne / en CI).
import { expect, test } from '@playwright/test'

const NOW = new Date().toISOString()
const LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/e/ed/logo.svg'
// Pixel PNG 1×1 : sert à « charger » les logos sans dépendre du réseau en CI.
const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Les logos de marque pointent vers upload.wikimedia.org (hors réseau en CI) :
// on les mocke pour que l'<img> se charge et reste dans le DOM (sinon le repli
// onerror le retirerait — comportement voulu, mais pas testé ici).
async function mockLogos(page: import('@playwright/test').Page) {
  await page.route('https://upload.wikimedia.org/**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(PIXEL_PNG_BASE64, 'base64')
    })
  })
}

// Neutralise la couche d'EXPLORATION (ticket 039). Les tests ci-dessous portent
// sur la couche « recherche par rayon » : sans ce mock, ils taperaient le vrai
// /api/map/stations, qui sert toute la base locale (~9 500 stations) et noierait
// les marqueurs sous 175 clusters. L'exploration a son propre test dédié.
async function mockEmptyBrowse(page: import('@playwright/test').Page) {
  await page.route('**/api/map/stations*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stations: [],
        bounds: { swLat: 48, swLon: 2, neLat: 49, neLon: 3 },
        fuel: 'Gazole',
        truncated: false
      })
    })
  })
}

function station(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'st-1',
    name: 'Station Alpha',
    brand: 'Total',
    logoUrl: LOGO_URL,
    address: '1 avenue des Tests',
    city: 'Paris',
    postalCode: '75001',
    position: { lat: 48.8566, lon: 2.3522 },
    fuel: 'E10',
    price: 1.899,
    updatedAt: NOW,
    distanceKm: 1.2,
    isReference: false,
    economics: { detourCost: 0.42, grossSavings: 6.04, netSavings: 5.62 },
    attractiveness: 0.8,
    freshness: { ageInHours: 2, status: 'fresh', score: 1 },
    ...overrides
  }
}

const MOCK_STATIONS = {
  stations: [
    station({
      id: 'st-fresh',
      name: 'Station Fraîche',
      price: 1.899,
      economics: { detourCost: 0.42, grossSavings: 6.04, netSavings: 5.62 },
      freshness: { ageInHours: 2, status: 'fresh', score: 1 }
    }),
    station({
      id: 'st-ref',
      name: 'Station Référence',
      price: 2.05,
      brand: 'Esso',
      logoUrl: null,
      isReference: true,
      position: { lat: 48.857, lon: 2.353 },
      economics: { detourCost: null, grossSavings: null, netSavings: null },
      freshness: { ageInHours: 3, status: 'fresh', score: 1 }
    }),
    // Un amas dense de stations ordinaires (sans référence ni recommandée)
    // autour du centre : c'est exactement le « trop de stations sur un petit
    // périmètre » de la demande — il doit se réduire en un seul cluster.
    // Écartement ~500 m entre stations : au zoom d'ouverture (11, seuil 2 km)
    // elles se chevauchent ; à partir du zoom 14 (seuil 0,25 km) elles se
    // séparent à l'écran.
    station({
      id: 'st-c1',
      name: 'Station Amas 1',
      brand: 'Total',
      position: { lat: 48.854, lon: 2.35 },
      economics: { detourCost: 0.3, grossSavings: 3, netSavings: 2.7 },
      freshness: { ageInHours: 2, status: 'fresh', score: 1 }
    }),
    station({
      id: 'st-c2',
      name: 'Station Amas 2',
      brand: 'Total',
      position: { lat: 48.8585, lon: 2.35 },
      economics: { detourCost: 0.31, grossSavings: 2.9, netSavings: 2.59 },
      freshness: { ageInHours: 2, status: 'fresh', score: 1 }
    }),
    station({
      id: 'st-c3',
      name: 'Station Amas 3',
      brand: 'Total',
      position: { lat: 48.863, lon: 2.35 },
      economics: { detourCost: 0.32, grossSavings: 2.8, netSavings: 2.48 },
      freshness: { ageInHours: 2, status: 'fresh', score: 1 }
    })
  ],
  referenceStation: {
    id: 'st-ref',
    name: 'Station Référence',
    brand: 'Esso',
    logoUrl: null,
    address: '2 rue Ref',
    city: 'Paris',
    postalCode: '75001',
    position: { lat: 48.857, lon: 2.353 },
    fuel: 'E10',
    price: 2.05,
    updatedAt: NOW
  },
  query: { center: { lat: 48.856, lon: 2.35 }, radius: 10, fuel: 'E10' }
}

const MOCK_RECOMMENDATION = {
  recommendation: {
    type: 'go-to-station',
    confidence: 0.9,
    quantityToBuy: 40,
    recommendedStation: {
      id: 'st-fresh',
      name: 'Station Fraîche',
      brand: 'Total',
      logoUrl: LOGO_URL,
      address: '1 avenue des Tests',
      city: 'Paris',
      postalCode: '75001',
      position: { lat: 48.8566, lon: 2.3522 },
      fuel: 'E10',
      price: 1.899,
      updatedAt: NOW
    },
    referenceStation: {
      id: 'st-ref',
      name: 'Station Référence',
      brand: null,
      logoUrl: null,
      address: '2 rue Ref',
      city: 'Paris',
      postalCode: '75001',
      position: { lat: 48.857, lon: 2.353 },
      fuel: 'E10',
      price: 2.05,
      updatedAt: NOW
    },
    detourCost: 0.42,
    grossSavings: 6.04,
    netSavings: 5.62,
    reasons: ['Cette station est moins chère et le détour est rentable.'],
    usedData: ['Prix officiels les plus récents pour ce carburant.'],
    ignoredData: [],
    calculations: ['Économie nette = 6,04 − 0,42 = 5,62 €.'],
    assumptions: ['Détour estimé en ligne droite, aller-retour.'],
    freshness: { ageInHours: 2, status: 'fresh', score: 1 },
    isPartial: false
  }
}

test('la carte se monte après une recherche avec mock API /api/stations', async ({ page }) => {
  await page.route('**/api/recommendation*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECOMMENDATION)
    })
  })
  await page.route('**/api/stations*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATIONS)
    })
  })
  await mockLogos(page)
  await mockEmptyBrowse(page)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()

  // La carte est bien montée (conteneur Leaflet), indépendamment des tuiles.
  const map = page.getByTestId('station-map')
  await expect(map).toBeVisible()
  await expect(map.getByText(/Carte des stations/)).toBeVisible()
  await expect(page.getByTestId('station-map-container')).toBeVisible()
  // Le conteneur Leaflet a reçu la classe leaflet-container (carte initialisée).
  await expect(page.getByTestId('station-map-container')).toHaveClass(/leaflet-container/)

  // Les contrôles de zoom accessibles sont présents avec leurs libellés.
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dézoomer', exact: true })).toBeVisible()

  // Les marqueurs individuels rendus : uniquement les points d'ancrage
  // (référence et recommandée, jamais regroupées) — les 3 stations de l'amas
  // sont dans le cluster.
  const markers = page.locator('.jflp-marker')
  await expect(markers).toHaveCount(2)
  await expect(page.locator('.jflp-marker-reference')).toHaveCount(1)
  await expect(page.locator('.jflp-marker-recommended')).toHaveCount(1)

  // L'amas de 3 stations ordinaires (~200 m du centre, toutes proches) est
  // regroupé en un cluster terracotta — la demande produit (ui-reference §5
  // « disques pleins terracotta avec le nombre »).
  await expect(page.locator('.jflp-cluster-marker')).toHaveCount(1)
  await expect(page.locator('.jflp-cluster')).toHaveText('3')

  // Clustering dynamique selon le zoom : en zoomant assez, les stations de
  // l'amas (500 m d'écart) ne se chevauchent plus à l'écran → le cluster
  // disparaît et les 3 marqueurs individuels réapparaissent (choix produit :
  // regroupement uniquement quand les marqueurs se chevauchent).
  //
  // Quatre crans et non trois depuis le ticket 040 : le seuil vaut désormais
  // 100 px (largeur d'un badge prix) au lieu de 38 px. Au zoom 14, 500 m ne
  // représentent que ~76 px — les badges se chevauchent ENCORE, donc le cluster
  // doit tenir. Au zoom 15 ils sont à ~152 px : séparés pour de bon. L'ancienne
  // calibration les séparait dès le zoom 14, alors qu'ils se recouvraient.
  const zoomer = page.getByRole('button', { name: 'Zoomer', exact: true })
  for (let i = 0; i < 4; i++) {
    await zoomer.click()
    await page.waitForTimeout(400)
  }
  await expect(page.locator('.jflp-cluster-marker')).toHaveCount(0)
  await expect(page.locator('.jflp-marker')).toHaveCount(5)

  // Ticket 021 : le badge marqueur porte le logo d'enseigne (décoratif,
  // alt vide — NFR-ACC-4), la référence (sans logo) porte le repli initiale.
  // Après le zoom, les 5 marqueurs sont visibles : 4 avec logo (recommandée +
  // amas Total), 1 avec repli initiale (référence Esso sans logo).
  await expect(page.locator('img.jflp-price-badge-logo')).toHaveCount(4)
  await expect(page.locator('img.jflp-price-badge-logo').first()).toHaveAttribute('alt', '')
  await expect(page.locator('.jflp-price-badge-logo-fallback')).toHaveCount(1)
  await expect(page.locator('.jflp-price-badge-logo-fallback')).toHaveText('E')
})

test('le touch sur un marqueur ouvre la popup et elle reste ouverte pendant le zoom (mobile)', async ({
  page
}) => {
  // Régression (bug signalé : « sur mobile le touch sur une station marche
  // pas / agit comme si je faisais 2 fois ») : le tap ouvre la popup puis le
  // flyTo zoome ; avant le correctif, `zoomend` supprimait et recréait toutes
  // les couches de marqueurs et détruisait la popup qui venait de s'ouvrir —
  // elle semblait clignoter puis disparaître, obligeant à retaper. On vérifie
  // qu'après un tap sur un marqueur, la popup reste ouverte une fois le zoom
  // terminé.
  await page.route('**/api/recommendation*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECOMMENDATION)
    })
  })
  await page.route('**/api/stations*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATIONS)
    })
  })
  await mockLogos(page)
  await mockEmptyBrowse(page)

  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByTestId('station-map-container')).toHaveClass(/leaflet-container/)

  // Les overlays flottants (recherche/carburant en haut, légende en bas à
  // gauche) recouvrent des marqueurs : on les masque pour que le badge du
  // marqueur recommandé soit atteignable au toucher, comme il le serait sur une
  // carte avec moins d'overlays. La légende a été ajoutée à ce masquage au
  // ticket 039 : elle a gagné une ligne de titre.
  await page.evaluate(() => {
    for (const selector of ['.map-overlay-top', '.map-overlay-legend']) {
      const overlay = document.querySelector(selector) as HTMLElement | null
      if (overlay) overlay.style.display = 'none'
    }
  })

  const badge = page.locator('.jflp-marker-recommended .jflp-badge-stack')
  await expect(badge).toBeVisible()
  const box = await badge.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2

  // Vérifier que le badge est bien l'élément touché (sinon le test taperait
  // à côté). Le marker Leaflet (0×0) est décoré du badge via translate.
  const hit = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py)
    return el ? (el as HTMLElement).closest('.jflp-badge-stack') !== null : false
  }, [x, y] as [number, number])
  expect(hit).toBe(true)

  // Un tap tactile réel (séquence touchStart/touchEnd via CDP — le contexte
  // de test Chromium n'a pas `hasTouch` activé, mais Leaflet écoute les
  // évènements tactile simulés par le navigateur).
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  // La popup s'ouvre (le tap déclenche bindPopup + flyTo vers zoom ≥ 14).
  const popup = page.locator('.leaflet-popup')
  await expect(popup).toBeVisible()

  // Une fois l'animation du zoom terminée (flyTo ~1 s), la popup doit
  // TOUJOURS être ouverte — c'est le cœur de la régression.
  await page.waitForTimeout(2500)
  await expect(popup).toBeVisible()
  await expect(popup.getByText('Station Fraîche')).toBeVisible()
})

test('déplacer la carte relance la recherche (recommandation + stations) autour du nouveau centre', async ({
  page
}) => {
  // Demande produit : « déplacer la carte devrait afficher les stations ».
  // Le pan de la carte (drag utilisateur) émet `recenter` ; la page relance
  // GET /api/recommendation ET /api/stations avec le nouveau centre (lat/lon).
  // On mocke l'API de façon DYNAMIQUE : chaque requête répond avec le centre
  // qu'elle a reçu, pour que la carte reste sur la zone pansée (pas de
  // « rattrapage » du mock vers le centre initial).
  const apiRequests: string[] = []
  await page.route('**/api/recommendation*', (route) => {
    const url = route.request().url()
    apiRequests.push(url)
    const parsed = new URL(url)
    const lat = Number(parsed.searchParams.get('lat') ?? '48.8566')
    const lon = Number(parsed.searchParams.get('lon') ?? '2.3522')
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recommendation: {
          ...MOCK_RECOMMENDATION.recommendation,
          recommendedStation: {
            ...MOCK_RECOMMENDATION.recommendation.recommendedStation!,
            position: { lat, lon }
          }
        }
      })
    })
  })
  await page.route('**/api/stations*', (route) => {
    const url = route.request().url()
    apiRequests.push(url)
    const parsed = new URL(url)
    const lat = Number(parsed.searchParams.get('lat') ?? '48.8566')
    const lon = Number(parsed.searchParams.get('lon') ?? '2.3522')
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...MOCK_STATIONS,
        query: { center: { lat, lon }, radius: 10, fuel: 'E10' }
      })
    })
  })
  await mockLogos(page)
  await mockEmptyBrowse(page)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByTestId('station-map-container')).toHaveClass(/leaflet-container/)
  await expect(page.locator('.jflp-marker')).toHaveCount(2)

  // La recherche ville initiale ne porte PAS de lat/lon : le pan est ce qui
  // introduit les coordonnées.
  const initialWithLatLon = apiRequests.filter((u) => u.includes('lat='))
  expect(initialWithLatLon.length).toBe(0)

  // Transform du panneau Leaflet AVANT le pan : reflète le centre initial.
  const paneTransform = (): Promise<string | null> =>
    page.evaluate(() => {
      const pane = document.querySelector('.leaflet-map-pane') as HTMLElement | null
      return pane ? pane.style.transform : null
    })
  const transformInitial = await paneTransform()
  expect(transformInitial).not.toBeNull()

  // Pan : glisser la carte depuis une zone vide (droite-centre, hors des
  // overlays et du panneau latéral).
  const box = (await page.getByTestId('station-map-container').boundingBox())!
  const sx = box.x + box.width * 0.75
  const sy = box.y + box.height * 0.4
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 260, sy - 120, { steps: 8 })
  await page.mouse.up()

  // Debounce (500 ms) + recherche → nouvelles requêtes avec lat/lon (une
  // recommandation + une liste), autour de la zone pansée.
  await expect
    .poll(() => apiRequests.filter((u) => u.includes('lat=')).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(2)

  // La recommandation a bien été relancée avec le centre de la carte.
  const recoWithLatLon = apiRequests.filter(
    (u) => u.includes('/api/recommendation') && u.includes('lat=')
  )
  expect(recoWithLatLon.length).toBeGreaterThanOrEqual(1)

  // Ticket 032 : le centre d'une carte pansée n'est pas la position de
  // l'utilisateur. Les deux endpoints doivent recevoir positionSource=place,
  // pour que la recommandation garde son hypothèse de détour.
  for (const path of ['/api/recommendation', '/api/stations']) {
    const panned = apiRequests.filter((u) => u.includes(path) && u.includes('lat='))
    expect(panned.length, path).toBeGreaterThanOrEqual(1)
    const params = new URL(panned[panned.length - 1]!).searchParams
    expect(params.get('positionSource'), path).toBe('place')
  }
  const parsed = new URL(recoWithLatLon.at(-1)!)
  expect(Number.isFinite(Number(parsed.searchParams.get('lat')))).toBe(true)
  expect(Number.isFinite(Number(parsed.searchParams.get('lon')))).toBe(true)

  // La liste des stations a été relancée avec le même centre.
  const stationsWithLatLon = apiRequests.filter(
    (u) => u.includes('/api/stations') && u.includes('lat=')
  )
  expect(stationsWithLatLon.length).toBeGreaterThanOrEqual(1)

  // La feuille n'a pas été forcée ouverte par le pan (elle garde son état :
  // la zone explorée reste visible sur la carte).
  const sheet = page.locator('.sheet')
  await expect(sheet).toHaveClass(/sheet-medium/)

  // La carte reste sur la zone pansée : le rafraîchissement des données
  // (recommandation + stations, centres différés) ne doit PAS la ramener au
  // centre initial (bug « la carte revient presque où elle était »). Le pan
  // est le SEUL ordre de déplacement : aucun flyTo ne doit être rejoué.
  // Le panneau Leaflet est un élément transformé (translate3d) : sa
  // transform reflète le centre de la carte. Si un flyTo parasite ramenait la
  // carte au centre initial, la transform reviendrait à `transformInitial`.
  const transformAfter = await paneTransform()
  expect(transformAfter).not.toBeNull()
  // Le pan a déplacé la carte de ~(+260, -120) px : la transform n'est PAS
  // revenue à la valeur du centre initial (pas de flyTo vers l'ancien centre).
  expect(transformAfter).not.toBe(transformInitial)
})

// ——— Ticket 034 : le cluster porte le meilleur prix frais de son groupe ———
// Un cluster n'affichait qu'un nombre : il fallait zoomer pour savoir si le
// groupe valait le détour. Le MINIMUM et non la moyenne — le disque porte déjà
// le dégradé de sa station la moins chère.
test('le cluster affiche « dès » + le meilleur prix frais du groupe', async ({ page }) => {
  // Amas de 4 stations ordinaires : 3 fraîches à des prix distincts, plus une
  // moins chère mais PÉRIMÉE (48 h) qui ne doit pas fournir le prix affiché.
  const amas = {
    ...MOCK_STATIONS,
    stations: [
      ...MOCK_STATIONS.stations.filter((s) => !String(s.id).startsWith('st-c')),
      station({ id: 'st-c1', position: { lat: 48.854, lon: 2.35 }, price: 1.949 }),
      station({ id: 'st-c2', position: { lat: 48.8585, lon: 2.35 }, price: 1.712 }),
      station({ id: 'st-c3', position: { lat: 48.863, lon: 2.35 }, price: 1.83 }),
      station({
        id: 'st-c4-perime',
        position: { lat: 48.8555, lon: 2.35 },
        price: 1.499,
        freshness: { ageInHours: 48, status: 'stale', score: 0.2 }
      })
    ]
  }

  await page.route('**/api/recommendation*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECOMMENDATION)
    })
  )
  await page.route('**/api/stations*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(amas) })
  )
  await mockLogos(page)
  await mockEmptyBrowse(page)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()

  await expect(page.getByTestId('station-map-container')).toHaveClass(/leaflet-container/)
  await expect(page.locator('.jflp-cluster-marker')).toHaveCount(1)
  await expect(page.locator('.jflp-cluster')).toHaveText('4')

  // Le prix affiché est le plus bas des FRAIS (1,712), jamais le prix périmé
  // (1,499) — « dès X € » ne repose jamais sur une donnée de 48 h.
  const label = page.locator('.jflp-cluster-label')
  await expect(label).toHaveText('dès 1,712 €')
  await expect(label).not.toContainText('1,499')

  // NFR-ACC-4 : le prix est aussi porté par le nom accessible, pas seulement
  // par le visuel et la couleur du disque.
  await expect(page.locator('.jflp-cluster-marker')).toHaveAttribute(
    'title',
    '4 stations regroupées, à partir de 1,712 €/L'
  )
})

// ——— Ticket 039 : exploration libre — rien ne disparaît au déplacement ———
// Avant ce ticket, la carte n'affichait que le résultat de la recherche par
// rayon : panner relançait cette recherche et les marqueurs de la zone quittée
// disparaissaient. Ici on vérifie le comportement observable : les marqueurs
// d'exploration se cumulent, et panner dans une zone déjà chargée ne provoque
// aucun appel.
test('les marqueurs d’exploration se cumulent et ne disparaissent pas au pan', async ({ page }) => {
  const mapCalls: string[] = []

  // Endpoint d'emprise : renvoie des stations DANS l'emprise demandée, pour que
  // dézoomer en découvre de nouvelles sans faire disparaître les précédentes.
  await page.route('**/api/map/stations*', (route) => {
    const url = route.request().url()
    mapCalls.push(url)
    const p = new URL(url).searchParams
    const swLat = Number(p.get('swLat'))
    const swLon = Number(p.get('swLon'))
    const neLat = Number(p.get('neLat'))
    const neLon = Number(p.get('neLon'))
    // Une grille de 5×5 stations réparties dans l'emprise : plus l'emprise est
    // large, plus les stations sont espacées — donc de nouveaux ids apparaissent.
    const stations = []
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const lat = swLat + ((neLat - swLat) * (i + 0.5)) / 5
        const lon = swLon + ((neLon - swLon) * (j + 0.5)) / 5
        stations.push({
          id: `br-${lat.toFixed(3)}-${lon.toFixed(3)}`,
          lat,
          lon,
          price: 1.7 + ((i * 5 + j) % 20) / 100,
          ageInHours: 3,
          status: 'fresh'
        })
      }
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stations,
        bounds: { swLat, swLon, neLat, neLon },
        fuel: 'Gazole',
        truncated: false
      })
    })
  })
  await page.route('**/api/recommendation*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECOMMENDATION)
    })
  )
  await page.route('**/api/stations*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATIONS)
    })
  )
  await mockLogos(page)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByTestId('station-map-container')).toHaveClass(/leaflet-container/)

  // L'emprise est demandée dès que la carte est prête (débounce 350 ms).
  await expect.poll(() => mapCalls.length, { timeout: 15_000 }).toBeGreaterThan(0)

  // Le compteur de marqueurs reflète les deux couches réunies : bien plus que
  // les 5 stations de la recherche par rayon.
  const counted = () =>
    page.evaluate(
      () =>
        document.querySelectorAll('.jflp-marker').length +
        document.querySelectorAll('.jflp-cluster-marker').length
    )
  await expect.poll(counted, { timeout: 15_000 }).toBeGreaterThan(2)
  const before = await counted()

  // Dézoomer : de nouvelles stations arrivent, AUCUNE ne disparaît.
  // Molette plutôt que le bouton « Dézoomer » : celui-ci est recouvert par le
  // FAB de recentrage (même coin bas-droit), et la molette est de toute façon
  // le geste réel d'un utilisateur.
  const callsBeforeZoom = mapCalls.length
  const zoomBox = (await page.getByTestId('station-map-container').boundingBox())!
  await page.mouse.move(zoomBox.x + zoomBox.width * 0.5, zoomBox.y + zoomBox.height * 0.4)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(600)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => mapCalls.length, { timeout: 15_000 }).toBeGreaterThan(callsBeforeZoom)
  await expect.poll(counted, { timeout: 15_000 }).toBeGreaterThanOrEqual(before)

  // Panner À L'INTÉRIEUR de la zone déjà chargée : aucun nouvel appel.
  // On attend d'abord que les chargements du zoom soient tous retombés (debounce
  // 350 ms + réseau) : sinon un appel encore en vol serait compté comme causé
  // par le pan.
  let stable = -1
  await expect
    .poll(
      async () => {
        const previous = stable
        stable = mapCalls.length
        await page.waitForTimeout(400)
        return previous === mapCalls.length ? 'stable' : 'en cours'
      },
      { timeout: 15_000 }
    )
    .toBe('stable')
  const callsBeforePan = mapCalls.length
  const box = (await page.getByTestId('station-map-container').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7 + 40, box.y + box.height * 0.45 + 20, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
  expect(mapCalls.length).toBe(callsBeforePan)

  // La légende dit à QUOI la couleur se compare : sans ça, une teinte qui change
  // au déplacement de la carte est ininterprétable (ticket 039).
  await expect(page.locator('.map-legend')).toContainText('Prix vs stations affichées')
})
