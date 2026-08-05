// app/utils/api.ts — Résolution de l'URL de base de l'API (APK / WebView).
// En mode natif (APK Capacitor), le fetch relatif '/api/...' tomberait sur
// `https://localhost` : on pointe donc vers l'API hébergée via la runtimeConfig
// publique `NUXT_PUBLIC_API_BASE`. En dev / web SSR (même origin), la base est
// vide et l'URL reste relative : Nitro sert l'API lui-même.
//
// Lecture : `useRuntimeConfig().public.apiBase` (la bonne API Nuxt, injectée
// dans le payload statique au build). Repli sur `import.meta.env` pour les
// environnements sans runtimeConfig (tests Vitest hors contexte Nuxt).
import { useRuntimeConfig } from '#imports'

let RESOLVED_BASE: string | null = null

function resolveApiBase(): string {
  if (RESOLVED_BASE !== null) return RESOLVED_BASE
  try {
    const base = useRuntimeConfig().public?.apiBase
    if (typeof base === 'string') {
      RESOLVED_BASE = base
      return base
    }
  } catch {
    // hors contexte Nuxt (tests) : on retombe sur import.meta.env
  }
  const envBase = import.meta.env.NUXT_PUBLIC_API_BASE as string | undefined
  RESOLVED_BASE = envBase ?? ''
  return RESOLVED_BASE
}

// Préfixe l'URL d'API relative par la base configurée. La base est stockée
// SANS slash final ; on ne duplique jamais les slashes.
export function apiUrl(path: string): string {
  const base = resolveApiBase().replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${cleanPath}` : cleanPath
}
