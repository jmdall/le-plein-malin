// tests/e2e/profile.spec.ts — Profil véhicule (ticket 013, spec §4 parcours de
// configuration). La page se charge avec le profil de l'API, puis un
// enregistrement est envoyé (mock PUT). Tests hermétiques : aucune dépendance
// réseau réelle.
import { expect, test } from '@playwright/test'

const MOCK_PROFILE = {
  profile: {
    fuel: 'Gazole',
    consumption: 6.5,
    tankCapacity: 55,
    currentLevel: 22,
    preferredQuantity: null,
    savingsThreshold: 1,
    updatedAt: '2026-08-03T08:00:00Z'
  }
}

test('la page profil se charge et préremplit le formulaire', async ({ page }) => {
  await page.route('**/api/vehicle-profile', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
      return
    }
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
  })

  await page.goto('/profil')
  await expect(page.getByRole('heading', { name: 'Profil du véhicule' })).toBeVisible()

  // Le formulaire est prérempli depuis GET /api/vehicle-profile.
  await expect(page.getByLabel('Consommation (L/100 km)')).toHaveValue('6.5')
  await expect(page.getByLabel('Capacité du réservoir (L)')).toHaveValue('55')
  await expect(page.getByLabel('Niveau actuel du réservoir (L)')).toHaveValue('22')
  await expect(page.getByRole('radio', { name: 'Gazole' })).toBeChecked()
})

test('le profil se sauvegarde avec un PUT', async ({ page }) => {
  let putBody: string | null = null
  await page.route('**/api/vehicle-profile', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
      return
    }
    putBody = route.request().postData()
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
  })

  await page.goto('/profil')
  await page.waitForLoadState('networkidle')

  await page.getByLabel('Consommation (L/100 km)').fill('7')
  await page.getByLabel('Seuil minimal d’économie pour un détour (€)').fill('2')

  await page.getByRole('button', { name: 'Enregistrer le profil' }).click()

  // Le PUT est parti avec les valeurs modifiées et le succès est affiché.
  await expect(page.getByRole('status')).toContainText('Profil enregistré')
  expect(putBody).not.toBeNull()
  const payload = JSON.parse(putBody!) as { consumption: number; savingsThreshold: number }
  expect(payload.consumption).toBe(7)
  expect(payload.savingsThreshold).toBe(2)
})
