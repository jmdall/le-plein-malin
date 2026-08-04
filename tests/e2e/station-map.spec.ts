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

  // Les marqueurs sont créés (un par station, la référence repérée).
  const markers = page.locator('.jflp-marker')
  await expect(markers).toHaveCount(2)
  await expect(page.locator('.jflp-marker-reference')).toHaveCount(1)

  // Ticket 021 : le badge marqueur porte le logo d'enseigne (décoratif,
  // alt vide — NFR-ACC-4), la référence (sans logo) porte le repli initiale.
  await expect(page.locator('img.jflp-price-badge-logo')).toHaveCount(1)
  await expect(page.locator('img.jflp-price-badge-logo')).toHaveAttribute('alt', '')
  await expect(page.locator('.jflp-price-badge-logo-fallback')).toHaveCount(1)
  await expect(page.locator('.jflp-price-badge-logo-fallback')).toHaveText('E')
})
