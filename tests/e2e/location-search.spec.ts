// tests/e2e/location-search.spec.ts — Ticket 031 : choisir une suggestion de
// l'autocomplete lance la recherche autour du centre de CETTE suggestion.
// Avant ce ticket, le centroïde renvoyé par le BAN était jeté et le serveur
// géocodait le texte une deuxième fois (Nominatim), autour d'un autre point :
// la station de référence, donc l'économie nette, changeaient silencieusement.
//
// Test hermétique : le BAN et l'API interne sont mockés, et on inspecte les
// paramètres réellement envoyés à /api/recommendation et /api/stations.
import { expect, test } from '@playwright/test'

const NOW = new Date().toISOString()

// Centre attendu : celui de la suggestion servie par le BAN mocké (Nantes).
const SUGGESTION_LAT = 47.2184
const SUGGESTION_LON = -1.5536

function banFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        // GeoJSON : [lon, lat].
        geometry: { type: 'Point', coordinates: [SUGGESTION_LON, SUGGESTION_LAT] },
        properties: {
          label: 'Nantes',
          type: 'municipality',
          name: 'Nantes',
          postcode: '44000',
          city: 'Nantes',
          context: '44, Loire-Atlantique, Pays de la Loire'
        }
      }
    ]
  }
}

function recommendation(fuel: string) {
  const station = (id: string, price: number) => ({
    id,
    name: `Station ${id}`,
    brand: null,
    logoUrl: null,
    address: '1 avenue du Test',
    city: 'Nantes',
    postalCode: '44000',
    position: { lat: SUGGESTION_LAT, lon: SUGGESTION_LON },
    fuel,
    price,
    updatedAt: NOW
  })
  return {
    recommendation: {
      type: 'go-to-station',
      confidence: 0.9,
      quantityToBuy: 40,
      recommendedStation: station('st-1', 1.799),
      referenceStation: station('ref', 1.949),
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

function stationsResult(fuel: string, radius: number) {
  return {
    stations: [
      {
        id: 'st-1',
        name: 'Station Alpha',
        brand: null,
        logoUrl: null,
        address: '1 avenue du Test',
        city: 'Nantes',
        postalCode: '44000',
        position: { lat: SUGGESTION_LAT, lon: SUGGESTION_LON },
        fuel,
        price: 1.799,
        updatedAt: NOW,
        distanceKm: 1.2,
        isReference: false,
        economics: { detourCost: 0.42, grossSavings: 6.04, netSavings: 5.62 },
        attractiveness: 0.8,
        freshness: { ageInHours: 2, status: 'fresh', score: 1 }
      }
    ],
    referenceStation: null,
    // Le serveur renvoie le centre retenu : ici exactement celui qu'on a envoyé.
    query: { center: { lat: SUGGESTION_LAT, lon: SUGGESTION_LON }, radius, fuel }
  }
}

// Prépare les mocks et retourne les collecteurs d'appels.
async function setupRoutes(page: import('@playwright/test').Page) {
  const recoCalls: string[] = []
  const stationsCalls: string[] = []

  await page.route('**/api-adresse.data.gouv.fr/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(banFeatureCollection())
    })
  })
  await page.route('**/api/recommendation*', async (route) => {
    const url = route.request().url()
    recoCalls.push(url)
    const fuel = new URL(url).searchParams.get('fuel') ?? 'Gazole'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(recommendation(fuel))
    })
  })
  await page.route('**/api/stations*', async (route) => {
    const url = route.request().url()
    stationsCalls.push(url)
    const params = new URL(url).searchParams
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        stationsResult(params.get('fuel') ?? 'Gazole', Number(params.get('radius') ?? 10))
      )
    })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return { recoCalls, stationsCalls }
}

test('choisir une suggestion envoie lat/lon — pas de second géocodage serveur', async ({
  page
}) => {
  const { recoCalls, stationsCalls } = await setupRoutes(page)

  // Frappe ≥ 3 caractères : l'autocomplete interroge le BAN (débounce 250 ms).
  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Nant')
  const options = page.getByRole('option')
  await expect(options.first()).toContainText('Nantes')

  await options.first().click()
  await expect(page.getByRole('heading', { name: 'Va plutôt à cette station' })).toBeVisible()

  // Les deux endpoints reçoivent le centre de la suggestion, et RIEN d'autre :
  // ni q ni postalCode, sinon le serveur regéocoderait le texte. Et tous deux
  // reçoivent positionSource=place : un lieu choisi n'est pas la position de
  // l'utilisateur, la recommandation garde son hypothèse de détour.
  await expect.poll(() => recoCalls.length).toBeGreaterThan(0)
  await expect.poll(() => stationsCalls.length).toBeGreaterThan(0)
  for (const calls of [recoCalls, stationsCalls]) {
    const params = new URL(calls[calls.length - 1]!).searchParams
    expect(Number(params.get('lat'))).toBeCloseTo(SUGGESTION_LAT, 4)
    expect(Number(params.get('lon'))).toBeCloseTo(SUGGESTION_LON, 4)
    expect(params.get('q')).toBeNull()
    expect(params.get('postalCode')).toBeNull()
    expect(params.get('positionSource')).toBe('place')
  }

  // Le libellé affiché reste le texte lisible, jamais des coordonnées.
  await expect(page.locator('.reco-applied')).toContainText('Nantes 44000')
  await expect(page.locator('.reco-applied')).not.toContainText('47.2')
})

test('la saisie libre garde le géocodage serveur (q / postalCode)', async ({ page }) => {
  const { recoCalls } = await setupRoutes(page)

  const input = page.getByPlaceholder('Rechercher une ville, une adresse…')
  const submit = page.getByRole('button', { name: 'Rechercher', exact: true })

  // Texte libre : le serveur géocode → paramètre q, aucune coordonnée.
  await input.fill('Paris')
  await submit.click()
  await expect(page.getByRole('heading', { name: 'Va plutôt à cette station' })).toBeVisible()
  await expect.poll(() => recoCalls.length).toBeGreaterThan(0)
  const textParams = new URL(recoCalls[recoCalls.length - 1]!).searchParams
  expect(textParams.get('q')).toBe('Paris')
  expect(textParams.get('lat')).toBeNull()

  expect(textParams.get('positionSource')).toBeNull()

  // Code postal à 5 chiffres : paramètre postalCode (comportement d'origine).
  const before = recoCalls.length
  await input.fill('44000')
  await submit.click()
  await expect.poll(() => recoCalls.length).toBeGreaterThan(before)
  const postalParams = new URL(recoCalls[recoCalls.length - 1]!).searchParams
  expect(postalParams.get('postalCode')).toBe('44000')
  expect(postalParams.get('lat')).toBeNull()
})

// Le BAN couvre l'outre-mer, l'API interne borne lat/lon à la France
// métropolitaine (shared/geo.ts). Une suggestion outre-mer doit retomber sur le
// géocodage serveur — pas produire une erreur 400 sur une recherche qui
// fonctionnait avant le ticket 031.
test('une suggestion hors bornes API retombe sur le géocodage serveur', async ({ page }) => {
  const recoCalls: string[] = []
  await page.route('**/api-adresse.data.gouv.fr/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            // Saint-Denis de La Réunion : lat ≈ -20.88, hors bornes de l'API.
            geometry: { type: 'Point', coordinates: [55.448, -20.879] },
            properties: {
              label: 'Saint-Denis',
              type: 'municipality',
              name: 'Saint-Denis',
              postcode: '97400',
              city: 'Saint-Denis',
              context: '974, La Réunion'
            }
          }
        ]
      })
    })
  })
  await page.route('**/api/recommendation*', async (route) => {
    recoCalls.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(recommendation('Gazole'))
    })
  })
  await page.route('**/api/stations*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stationsResult('Gazole', 10))
    })
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.getByPlaceholder('Rechercher une ville, une adresse…').fill('Saint-D')
  const option = page.getByRole('option').first()
  await expect(option).toContainText('Saint-Denis')
  await option.click()

  await expect.poll(() => recoCalls.length).toBeGreaterThan(0)
  const params = new URL(recoCalls[recoCalls.length - 1]!).searchParams
  // Repli : le texte part, le serveur géocode. Aucune coordonnée refusée.
  expect(params.get('q')).toBe('Saint-Denis 97400')
  expect(params.get('lat')).toBeNull()
  expect(params.get('positionSource')).toBeNull()
})
