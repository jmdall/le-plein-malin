// capacitor.config.ts — Configuration Capacitor (APK Android).
// L'app Nuxt est buildée en statique (`nuxt generate`) : Capacitor embarque
// le site dans une WebView Android et sert les fichiers locaux. L'API reste
// distante (voir app/utils/api.ts + NUXT_PUBLIC_API_BASE) — aucun backend
// embarqué dans l'APK.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'fr.jmdall.lepleinmalin',
  appName: 'Je fais le plein ou non ?',
  webDir: '.output/public',
  server: {
    // La WebView charge le contenu local du bundle (pas de serveur externe).
    androidScheme: 'https'
  }
}

export default config
