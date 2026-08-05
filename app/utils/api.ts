// app/utils/api.ts — Résolution de l'URL de base de l'API (APK / WebView).
// En mode natif (APK Capacitor), le fetch relatif '/api/...' tomberait sur
// `capacitor://localhost` : on pointe donc vers l'API hébergée via la variable
// d'environnement de build `NUXT_PUBLIC_API_BASE` (inline par Vite au build,
// exposée côté client — aucun secret). En dev / web SSR (même origin), la base
// est vide et l'URL reste relative : Nitro sert l'API lui-même.
//
// On lit `import.meta.env` directement (et non `useRuntimeConfig`) pour que ces
// fonctions restent testables en isolation (tests unitaires sans contexte Nuxt).
const API_BASE: string = import.meta.env.NUXT_PUBLIC_API_BASE ?? ''

// Préfixe l'URL d'API relative par la base configurée. La base est stockée
// SANS slash final ; on ne duplique jamais les slashes.
export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${cleanPath}` : cleanPath
}
