// nuxt.config.ts — Configuration Nuxt (ticket 010 : lang fr, CSS global,
// mode sombre, PWA via modèles intégrés). TS strict (voir tsconfig).
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
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
