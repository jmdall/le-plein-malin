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

// ——— Transport HTTP unique du client (ticket 029) ———
// apiFetch encapsule fetch + erreur normalisée (messages français) + parsing
// JSON + garde anti-race. Les composables (useStations, useFuelRecommendation)
// ne font plus de transport : ils ne gardent que leur machine d'état.
//
// Messages d'erreur EXACTS (testés via les composables) :
// - réseau : « Impossible de joindre le serveur. Vérifiez votre connexion. »
// - non-ok sans message : « Le serveur a renvoyé une erreur. »
// - non-ok avec body.error.message : ce message
// - JSON invalide / forme non valide : « Le serveur a renvoyé une réponse invalide. »
//
// `isStale` : vérifié après chaque await. Si la requête n'est plus la plus
// récente, apiFetch retourne { ok: false, error: 'stale' } — le composable
// interprète ce signal comme « ignore ce résultat » (pas d'écriture d'état).
export type ApiFetchResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ApiFetchOptions<T> {
  isStale?: () => boolean
  /** Validation de la forme de la réponse (ex. array stations). Échec → réponse invalide. */
  validate?: (data: T) => boolean
}

export async function apiFetch<T>(
  path: string,
  params: URLSearchParams,
  options?: ApiFetchOptions<T>
): Promise<ApiFetchResult<T>> {
  const { isStale, validate } = options ?? {}
  const url = apiUrl(`${path}?${params.toString()}`)

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    if (isStale?.()) return { ok: false, error: 'stale' }
    return { ok: false, error: 'Impossible de joindre le serveur. Vérifiez votre connexion.' }
  }

  if (!response.ok) {
    let message = 'Le serveur a renvoyé une erreur.'
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body.error?.message) {
        message = body.error.message
      }
    } catch {
      // corps non JSON : on garde le message générique
    }
    if (isStale?.()) return { ok: false, error: 'stale' }
    return { ok: false, error: message }
  }

  let data: T
  try {
    data = (await response.json()) as T
  } catch {
    if (isStale?.()) return { ok: false, error: 'stale' }
    return { ok: false, error: 'Le serveur a renvoyé une réponse invalide.' }
  }

  if (validate && !validate(data)) {
    if (isStale?.()) return { ok: false, error: 'stale' }
    return { ok: false, error: 'Le serveur a renvoyé une réponse invalide.' }
  }

  if (isStale?.()) return { ok: false, error: 'stale' }
  return { ok: true, data }
}
