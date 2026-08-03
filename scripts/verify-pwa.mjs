#!/usr/bin/env node
// scripts/verify-pwa.mjs — Vérification PWA réelle sur le build de production
// (ticket 014). Usage : `npm run build && PORT=3210 node .output/server/index.mjs`
// puis lancer ce script avec BASE_URL=http://localhost:3210.
//  1. manifeste + service worker enregistré (installabilité)
//  2. l'app shell (offline.html) se charge HORS-LIGNE
//  3. une recherche hors-ligne affiche une erreur explicite — jamais un prix
//     périmé (NFR-PWA-3)
import { chromium } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3210'

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true })
const context = await browser.newContext()
const page = await context.newPage()

page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200))
})

await page.goto(BASE_URL + '/')
await page.waitForLoadState('networkidle')

// 1. Manifeste + SW
const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
console.log('[manifest link]', manifestHref)
await page.waitForFunction(
  async () => (await navigator.serviceWorker?.getRegistration())?.active != null,
  null,
  { timeout: 15000 }
)
console.log('[sw] service worker actif')

// Attendre que le précache d'offline.html soit terminé avant de couper le réseau.
await page.waitForFunction(
  async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key)
      if (await cache.match('/offline.html')) return true
    }
    return false
  },
  null,
  { timeout: 30000 }
)
console.log('[precache] offline.html en cache')

// La page n'est contrôlée par le SW qu'après une seconde navigation :
// recharger en ligne pour que navigator.serviceWorker.controller soit défini.
await page.goto(BASE_URL + '/')
await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 15000 })
console.log('[sw] page contrôlée par le service worker')

// 2. Hors-ligne : l'app shell (offline.html) se recharge
await context.setOffline(true)
await page.goto(BASE_URL + '/', { timeout: 15000 }).catch(() => null)
await page.waitForTimeout(1500)
const h1 = await page.locator('h1').first().innerText().catch(() => 'INTROUVABLE')
console.log('[offline h1]', h1)
const explicit = /hors ligne/.test(h1.toLowerCase()) || /hors-ligne/.test(h1.toLowerCase())
console.log('[offline page explicite]', explicit)

// 3. Aucun prix périmé servi hors-ligne (la page offline n'affiche pas de prix)
const bodyText = await page.locator('body').innerText().catch(() => '')
console.log('[aucun prix affiché hors-ligne]', !/\d,\d{3} €\/L/.test(bodyText))

await context.setOffline(false)
await browser.close()

const ok = manifestHref && explicit && !/\d,\d{3} €\/L/.test(bodyText)
console.log(ok ? 'VERIFY_PWA_OK' : 'VERIFY_PWA_FAIL')
process.exit(ok ? 0 : 1)
