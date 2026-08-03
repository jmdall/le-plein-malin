import { defineConfig, devices } from '@playwright/test'

// Port libre sur cette machine : 3000 est occupé par un autre service (le
// jeu d'outils du système). On utilise 3100 pour le serveur e2e.
const PORT = process.env.E2E_PORT ?? '3100'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Sur Debian 11 arm64 (Raspberry Pi), les binaires Playwright ne sont
        // pas téléchargeables : on utilise le chromium système. --disable-gpu
        // évite le blocage EGL/ANGLE sans affichage X sur cette machine.
        launchOptions: {
          executablePath: '/usr/bin/chromium',
          args: ['--disable-gpu']
        }
      }
    }
  ],
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
