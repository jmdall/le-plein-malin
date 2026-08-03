// nuxt.config.ts — Configuration Nuxt (ticket 010 : lang fr, CSS global,
// mode sombre ; ticket 014 : PWA installable — manifeste + service worker,
// app shell en cache, prix jamais servis hors-ligne). TS strict (voir tsconfig).
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@vite-pwa/nuxt'],
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Je fais le plein ou non ?',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'Sachez si vous devez faire le plein maintenant, attendre, ou aller dans une autre station, à partir des prix officiels des carburants.'
        }
      ],
      script: [
        // Mode sombre sans flash (lecture de la préférence avant le rendu).
        {
          innerHTML: `(function(){try{var t=localStorage.getItem('jflp.theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})();`
        }
      ]
    }
  },
  css: ['~/assets/css/main.css'],
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Je fais le plein ou non ?',
      short_name: 'Plein ou non ?',
      description:
        'Décidez si vous devez faire le plein maintenant, attendre, ou aller dans une autre station, à partir des prix officiels des carburants.',
      lang: 'fr',
      theme_color: '#00a86b',
      background_color: '#0f172a',
      display: 'standalone',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    },
    workbox: {
      // Seul le shell statique est précaché (offline.html + icônes) : léger et
      // fiable même sur un Raspberry Pi (le précache complet du bundle JS
      // échouait de façon intermittente). Le bundle n'est PAS précaché : hors
      // ligne, l'utilisateur voit le shell statique explicite — jamais de prix
      // périmé servi (ticket 014, NFR-PWA-3, spec §2.2). Les demandes /api/
      // sont TOUJOURS réseau (NetworkOnly).
      globPatterns: ['**/*.{ico,png,svg,woff2,webmanifest}'],
      additionalManifestEntries: [{ url: '/offline.html', revision: '1' }],
      // SSR : pas de index.html statique — les navigations hors-ligne tombent
      // sur public/offline.html (aucun prix périmé servi).
      navigateFallback: '/offline.html',
      runtimeCaching: [
        {
          urlPattern: /\/api\//,
          handler: 'NetworkOnly'
        }
      ]
    },
    devOptions: {
      // Pas de service worker en développement (ne perturbe pas les e2e).
      enabled: false
    }
  },
  typescript: {
    strict: true,
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true
      }
    }
  }
})
