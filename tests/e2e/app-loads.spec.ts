import { expect, test } from '@playwright/test'

test('l\'app se charge', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Je fais le plein ou non/ })).toBeVisible()
})
