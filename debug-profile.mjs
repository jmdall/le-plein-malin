import { chromium } from '@playwright/test'

const MOCK_PROFILE = {
  profile: { fuel: 'Gazole', consumption: 6.5, tankCapacity: 55, currentLevel: 22, preferredQuantity: null, savingsThreshold: 1, updatedAt: '2026-08-03T08:00:00Z' }
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true })
const page = await browser.newPage()
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[console.' + m.type() + ']', m.text().slice(0, 200)) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)))
page.on('request', (r) => { if (r.url().includes('/api/')) console.log('[request]', r.method(), r.url()) })
page.on('response', (res) => { if (res.url().includes('/api/')) console.log('[response]', res.status(), res.url()) })

await page.route('**/api/vehicle-profile', (route) => {
  if (route.request().method() === 'GET') {
    console.log('[mock GET hit]')
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
    return
  }
  console.log('[mock other]', route.request().method())
  void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
})

await page.goto('http://localhost:3100/profil')
await page.waitForTimeout(5000)
console.log('=== INPUT VALUES ===')
console.log('conso:', await page.getByLabel('Consommation (L/100 km)').inputValue().catch((e) => 'ERR ' + e.message.split('\n')[0]))
await browser.close()
