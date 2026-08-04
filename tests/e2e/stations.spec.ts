// tests/e2e/stations.spec.ts — Liste des stations (ticket 011, spec §5.3/§6).
// Parcours : recherche par ville, puis la liste apparaît avec mock API
// /api/stations (mêmes paramètres que la recommandation). Vérifie : les
// champs STA-1, le tri par économie nette décroissante (STA-2), les badges de
// fraîcheur (STA-3/FRE-1/FRE-3), l'étoile favori (STA-5) et l'itinéraire OSM.
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
      netSavings: 5.62,
      economics: { detourCost: 0.42, grossSavings: 6.04, netSavings: 5.62 },
      freshness: { ageInHours: 2, status: 'fresh', score: 1 }
    }),
    station({
      id: 'st-stale',
      name: 'Station Atténuée',
      price: 1.95,
      netSavings: 2.1,
      economics: { detourCost: 0.3, grossSavings: 2.4, netSavings: 2.1 },
      freshness: { ageInHours: 30, status: 'stale', score: 0.75 }
    }),
    station({
      id: 'st-obsolete',
      name: 'Station Obsolète',
      price: 1.85,
      netSavings: 4.1,
      economics: { detourCost: 0.4, grossSavings: 4.5, netSavings: 4.1 },
      freshness: { ageInHours: 60, status: 'obsolete', score: 0 }
    }),
    station({
      id: 'st-ref',
      name: 'Station Référence',
      price: 2.05,
      isReference: true,
      economics: { detourCost: null, grossSavings: null, netSavings: null },
      freshness: { ageInHours: 3, status: 'fresh', score: 1 }
    })
  ],
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

test('la liste des stations apparaît après une recherche avec mock API', async ({ page }) => {
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

  // La liste apparaît (section dédiée) avec son titre.
  const list = page.getByTestId('station-list')
  await expect(list).toBeVisible()
  await expect(list.getByText(/stations?$/)).toBeVisible()

  // Champs STA-1 : nom, prix, distance, date de mise à jour, économie nette.
  await expect(page.getByRole('heading', { name: 'Station Fraîche' })).toBeVisible()
  await expect(page.getByTestId('station-price').first()).toContainText('1,899 €/L')
  await expect(page.getByText(/1,2 km/).first()).toBeVisible()
  await expect(page.getByText(/mis à jour le/).first()).toBeVisible()
  await expect(page.getByTestId('station-net-savings').first()).toContainText('5,62 €')

  // Ticket 021 : le nom réel remplace l'id et l'enseigne+logo s'affichent
  // (logo décoratif alt="", le nom reste en texte — NFR-ACC-4).
  await expect(page.getByTestId('brand-badge').first()).toContainText('Total')
  await expect(page.getByTestId('brand-badge').first().locator('img')).toHaveAttribute('alt', '')
  await expect(page.getByText(/Noms et logos des stations/).first()).toBeVisible()

  // Badge de fraîcheur exact (STA-3, FRE-1).
  await expect(page.getByText('potentiellement obsolète')).toBeVisible()
  await expect(page.getByText('exclu des recommandations')).toBeVisible()

  // Tri par économie nette décroissante (STA-2) : fraîche (5,62) en premier,
  // la référence en bas.
  const cards = page.locator('.station-card')
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(0)).toContainText('Station Fraîche')
  await expect(cards.nth(3)).toContainText('Station Référence')

  // L'étoile favori bascule (STA-5) et persiste en localStorage.
  const favButton = cards.nth(0).getByRole('button', { name: /Ajouter aux favoris/ })
  await favButton.click()
  await expect(cards.nth(0).getByRole('button', { name: /Retirer des favoris/ })).toBeVisible()
  const stored = await page.evaluate(() => localStorage.getItem('jflp.favorites'))
  expect(JSON.parse(stored ?? '[]')).toContain('st-fresh')

  // Itinéraire OSM (spec §4 #7).
  const itinerary = page.getByRole('link', { name: 'Itinéraire' }).first()
  await expect(itinerary).toHaveAttribute('href', /openstreetmap\.org\/directions/)
})
