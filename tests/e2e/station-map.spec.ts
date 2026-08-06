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

  // Clustering dynamique selon le zoom : en zoomant (500 m d'écart, seuil
  // 2 km au zoom 11 → 0,25 km au zoom 14), les stations de l'amas ne se
  // chevauchent plus à l'écran → le cluster disparaît et les 3 marqueurs
  // individuels réapparaissent (choix produit : regroupement uniquement
  // quand les marqueurs se chevauchent).
  const zoomer = page.getByRole('button', { name: 'Zoomer', exact: true })
  for (let i = 0; i < 3; i++) {
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

  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByTestId('station-map-container')).toHaveClass(/leaflet-container/)

  // L'overlay haut (recherche/carburant) recouvre les premiers marqueurs :
  // on le masque pour que le badge du marqueur recommandé soit atteignable
  // au toucher, comme il le serait sur une carte avec moins d'overlays.
  await page.evaluate(() => {
    const overlay = document.querySelector('.map-overlay-top') as HTMLElement | null
    if (overlay) overlay.style.display = 'none'
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
