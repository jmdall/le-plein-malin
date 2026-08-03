// ESLint — configuration flat (ESLint 9+)
// https://eslint.nuxt.com/packages/module#flat-config
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: [
    '.output/**',
    '.nuxt/**',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'node_modules/**'
  ]
})
