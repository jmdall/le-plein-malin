// tests/e2e/recommendation.spec.ts — Parcours principal (ticket 010, spec §4).
// La page se charge, puis la recommandation apparaît avec un mock de l'API
// /api/recommendation (aucune dépendance réseau réelle).
import { expect, test } from '@playwright/test'

const MOCK_RECOMMENDATION = {
  recommendation: {
    type: 'go-to-station',
    confidence: 0.9,
    quantityToBuy: 40,
    recommendedStation: {
      id: 'mock-1',
      name: 'Station Mock Total',
      brand: 'Total',
      address: '1 avenue du Test',
      city: 'Paris',
      postalCode: '75001',
      position: { lat: 48.8566, lon: 2.3522 },
      fuel: 'E10',
      price: 1.899,
      updatedAt: '2026-08-03T08:00:00Z'
    },
    referenceStation: {
      id: 'mock-ref',
      name: 'Station référence',
      brand: null,
      address: '2 rue Ref',
      city: 'Paris',
      postalCode: '75001',
      position: { lat: 48.857, lon: 2.353 },
      fuel: 'E10',
      price: 2.05,
      updatedAt: '2026-08-03T08:00:00Z'
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

test('la page se charge et affiche le formulaire localisation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Je fais le plein ou non/ })).toBeVisible()
  await expect(page.getByPlaceholder('Ex. : Lyon ou 69001')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rechercher', exact: true })).toBeVisible()
})

test('la recommandation apparaît après une recherche avec mock API', async ({ page }) => {
  // Mock de l'API de recommandation (aucun appel réel au serveur).
  await page.route('**/api/recommendation*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECOMMENDATION)
    })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Hydratation Vue lente sur ce Raspberry Pi : cliquer pendant l'hydratation
  // déclenche le submit natif (reload) avant que @submit.prevent soit attaché.
  await page.waitForTimeout(1500)

  // Recherche par ville sans géolocalisation (LOC-2).
  await page.getByPlaceholder('Ex. : Lyon ou 69001').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()

  // La recommandation apparaît : titre, station, prix, date, économie nette.
  await expect(page.getByRole('heading', { name: 'Va plutôt à cette station' })).toBeVisible()
  await expect(page.getByText('Station Mock Total')).toBeVisible()
  await expect(page.getByText('1,899 €/L')).toBeVisible()
  await expect(page.getByTestId('net-savings')).toContainText('5,62 €')
  await expect(page.getByText(/Mis à jour le/)).toBeVisible()

  // Le panneau « Voir le calcul » se déplie avec les raisons et hypothèses.
  await page.getByRole('button', { name: 'Voir le calcul' }).click()
  await expect(page.getByTestId('calc-panel')).toBeVisible()
  await expect(page.getByText('Cette station est moins chère et le détour est rentable.')).toBeVisible()
  await expect(page.getByText('Détail du calcul')).toBeVisible()

  // Le bouton « Itinéraire » pointe vers OpenStreetMap avec les coordonnées.
  const itinerary = page.getByRole('link', { name: 'Itinéraire' })
  await expect(itinerary).toBeVisible()
  await expect(itinerary).toHaveAttribute('href', /openstreetmap\.org\/directions/)

  // La date/heure de mise à jour est toujours affichée avec le prix (FRE-1).
  await expect(page.getByTestId('rec-updated')).toContainText('03/08/2026')
})
