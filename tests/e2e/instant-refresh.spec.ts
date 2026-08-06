// tests/e2e/instant-refresh.spec.ts — TASK B : changer le carburant ou le rayon
// relance immédiatement la recherche (recommandation + liste + carte + compteur),
// sans passer par le bouton « Recalculer ». Le centre (ville/CP) reste celui de
// la dernière recherche (reco.lastSearch). Test hermétique : l'API est mockée,
// et on vérifie que chaque changement déclenche bien de nouveaux appels avec les
// bons paramètres fuel / radius.
import { expect, test } from '@playwright/test'

const NOW = new Date().toISOString()

function recommendation(fuel: string, price: number, id: string) {
  return {
    recommendation: {
      type: 'go-to-station',
      confidence: 0.9,
      quantityToBuy: 40,
      recommendedStation: {
        id,
        name: `Station ${id}`,
        brand: null,
        logoUrl: null,
        address: '1 avenue du Test',
        city: 'Paris',
        postalCode: '75001',
        position: { lat: 48.8566, lon: 2.3522 },
        fuel,
        price,
        updatedAt: NOW
      },
      referenceStation: {
        id: 'ref',
        name: 'Station référence',
        brand: null,
        logoUrl: null,
        address: '2 rue Ref',
        city: 'Paris',
        postalCode: '75001',
        position: { lat: 48.857, lon: 2.353 },
        fuel,
        price: price + 0.15,
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
}

function stationsResult(fuel: string, price: number, radius: number) {
  return {
    stations: [
      {
        id: 'st-1',
        name: 'Station Alpha',
        brand: null,
        logoUrl: null,
        address: '1 avenue du Test',
        city: 'Paris',
        postalCode: '75001',
        position: { lat: 48.8566, lon: 2.3522 },
        fuel,
        price,
        updatedAt: NOW,
        distanceKm: 1.2,
        isReference: false,
        economics: { detourCost: 0.42, grossSavings: 6.04, netSavings: 5.62 },
        attractiveness: 0.8,
        freshness: { ageInHours: 2, status: 'fresh', score: 1 }
      }
    ],
    referenceStation: null,
    query: { center: { lat: 48.856, lon: 2.35 }, radius, fuel }
  }
}

test('changer le carburant relance immédiatement la recherche', async ({ page }) => {
  const recoCalls: string[] = []
  const stationsCalls: string[] = []
  await page.route('**/api/recommendation*', async (route) => {
    const url = route.request().url()
    recoCalls.push(url)
    const fuel = new URL(url).searchParams.get('fuel') ?? 'Gazole'
    const price = fuel === 'SP95' ? 1.799 : 1.899
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(recommendation(fuel, price, 'st-1'))
    })
  })
  await page.route('**/api/stations*', async (route) => {
    const url = route.request().url()
    stationsCalls.push(url)
    const params = new URL(url).searchParams
    const fuel = params.get('fuel') ?? 'Gazole'
    const radius = Number(params.get('radius') ?? 10)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stationsResult(fuel, fuel === 'SP95' ? 1.799 : 1.899, radius))
    })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  // Recherche par ville : première recommandation Gazole (défaut).
  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Va plutôt à cette station' })).toBeVisible()

  const initialRecoCalls = recoCalls.length
  const initialStationsCalls = stationsCalls.length
  const initialUrl = new URL(recoCalls[recoCalls.length - 1]!)
  expect(initialUrl.searchParams.get('fuel')).toBe('Gazole')
  expect(initialUrl.searchParams.get('radius')).toBe('10')

  // Changement de carburant SANS cliquer « Recalculer ».
  await page.getByRole('tab', { name: 'SP95', exact: true }).click()

  // Nouvel appel recommandation avec SP95, même centre, même rayon (10).
  await expect.poll(() => recoCalls.length).toBe(initialRecoCalls + 1)
  await expect.poll(() => stationsCalls.length).toBe(initialStationsCalls + 1)
  const refetchedUrl = new URL(recoCalls[recoCalls.length - 1]!)
  expect(refetchedUrl.searchParams.get('fuel')).toBe('SP95')
  expect(refetchedUrl.searchParams.get('radius')).toBe('10')
  expect(refetchedUrl.searchParams.get('q')).toBe('Paris')

  // La liste / la carte reflètent le nouveau carburant.
  await expect(page.getByTestId('station-list')).toBeVisible()
  await expect(page.getByTestId('station-price').first()).toContainText('1,799 €/L')
  await expect(page.locator('.map-counter')).toContainText('1 station')

  // La sélection visuelle reste cohérente avec la recherche appliquée.
  await expect(page.getByRole('tab', { name: 'SP95', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Gazole' })).toHaveAttribute('aria-selected', 'false')
})

test('changer le rayon relance immédiatement la recherche', async ({ page }) => {
  const recoCalls: string[] = []
  const stationsCalls: string[] = []
  await page.route('**/api/recommendation*', async (route) => {
    const url = route.request().url()
    recoCalls.push(url)
    const params = new URL(url).searchParams
    const fuel = params.get('fuel') ?? 'Gazole'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(recommendation(fuel, 1.899, 'st-1'))
    })
  })
  await page.route('**/api/stations*', async (route) => {
    const url = route.request().url()
    stationsCalls.push(url)
    const params = new URL(url).searchParams
    const fuel = params.get('fuel') ?? 'Gazole'
    const radius = Number(params.get('radius') ?? 10)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stationsResult(fuel, 1.899, radius))
    })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Va plutôt à cette station' })).toBeVisible()

  const initialRecoCalls = recoCalls.length
  const initialStationsCalls = stationsCalls.length

  // Le sélecteur de rayon vit dans la bottom sheet (Réglages). Les <input>
  // radios sont .sr-only (masqués visuellement) : on clique sur le libellé.
  await page.getByText('20 km', { exact: true }).click()

  await expect.poll(() => recoCalls.length).toBe(initialRecoCalls + 1)
  await expect.poll(() => stationsCalls.length).toBe(initialStationsCalls + 1)
  const refetchedUrl = new URL(recoCalls[recoCalls.length - 1]!)
  expect(refetchedUrl.searchParams.get('radius')).toBe('20')
  expect(refetchedUrl.searchParams.get('fuel')).toBe('Gazole')
  expect(refetchedUrl.searchParams.get('q')).toBe('Paris')

  // La sélection visuelle du rayon est cohérente.
  await expect(page.getByRole('radio', { name: '20 km' })).toBeChecked()
  await expect(page.getByRole('radio', { name: '10 km' })).not.toBeChecked()
})

test('après rechargement, la sélection carburant reflète la préférence mémorisée — un seul onglet actif', async ({
  page
}) => {
  const calls: string[] = []
  await page.route('**/api/recommendation*', async (route) => {
    const fuel = new URL(route.request().url()).searchParams.get('fuel') ?? 'Gazole'
    calls.push(fuel)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(recommendation(fuel, 1.899, 'st-1'))
    })
  })
  await page.route('**/api/stations*', async (route) => {
    const params = new URL(route.request().url()).searchParams
    const fuel = params.get('fuel') ?? 'Gazole'
    const radius = Number(params.get('radius') ?? 10)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stationsResult(fuel, 1.899, radius))
    })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)

  // Une recherche d'abord (crée reco.lastSearch), puis sélectionner SP95.
  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Paris')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect.poll(() => calls.length).toBeGreaterThan(0)
  await page.waitForTimeout(800)

  await page.getByRole('tab', { name: 'SP95', exact: true }).click()
  await expect.poll(() => calls[calls.length - 1]).toBe('SP95')

  // Recharger : la préférence (SP95) doit rester la seule sélection active.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)

  await expect(page.getByRole('tab', { name: 'SP95', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Gazole', exact: true })).toHaveAttribute('aria-selected', 'false')
  const activeTabs = page.locator('.fuel-selector button[role="tab"].segmented-tab-active')
  await expect(activeTabs).toHaveCount(1)
  await expect(activeTabs.first()).toHaveText('SP95')
})
