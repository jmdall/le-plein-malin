// server/middleware/cors.ts — CORS pour l'API (ticket 023, APK Capacitor).
// En WebView Capacitor, l'app est servie sur https://localhost (origin locale)
// et appelle l'API distante https://api.example.com : c'est cross-origin.
// Sans headers CORS, la réponse est bloquée par la WebView → le client reçoit
// un corps vide → « serveur a renvoyé une réponse invalide ».
//
// Ce middleware : ajoute les headers CORS aux réponses, et répond au preflight
// OPTIONS (que le routeur GET /api/* ne gère pas — d'où le 404).
// Aucune règle métier ici : pur transport HTTP.
import {
  defineEventHandler,
  appendCorsHeaders,
  appendCorsPreflightHeaders,
  isPreflightRequest,
  getRequestHeader
} from 'h3'

const ALLOWED_ORIGINS = new Set([
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
  'https://api.example.com'
])

export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return
  if (!ALLOWED_ORIGINS.has(origin)) return

  if (isPreflightRequest(event)) {
    appendCorsPreflightHeaders(event, {
      origin,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      credentials: false
    })
    // Retourner une valeur (et non undefined) fait de ce middleware la réponse
    // complète : h3 n'appelle PAS le handler du routeur, donc le preflight
    // répond 204 (au lieu de tomber sur le 404 du GET /api/*).
    event.node.res.statusCode = 204
    return null
  }

  appendCorsHeaders(event, { origin, credentials: false })
})
