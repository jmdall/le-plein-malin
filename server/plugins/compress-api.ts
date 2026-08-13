// server/plugins/compress-api.ts — Compression gzip des réponses de l'API
// (ticket 038). Nitro ne compresse pas les réponses dynamiques : vérifié sur le
// serveur bâti, aucune réponse ne portait de `content-encoding`.
//
// Point d'accroche : le hook `beforeResponse` est AWAITÉ par Nitro et h3 utilise
// le corps muté —
//   await options.onBeforeResponse(event, _response)
//   await handleHandlerResponse(event, _response.body, spacing)
// — donc remplacer `response.body` suffit, et `handleHandlerResponse` pose
// ensuite le `content-length` du Buffer (aucune longueur périmée à corriger).
//
// Subtilité qui décide de l'implémentation : à ce stade le corps est encore un
// OBJET JS, pas du JSON sérialisé. On sérialise donc ici, puis on pose
// explicitement le content-type — on ne devine jamais celui d'un corps qu'on
// n'a pas sérialisé soi-même (Buffer, flux, chaîne HTML : on ne touche pas).
//
// La compression est un TRANSPORT : aucune donnée n'est modifiée.
import { defineNitroPlugin } from 'nitropack/runtime'
import { getRequestHeader, getResponseHeader, setResponseHeader } from 'h3'
import { gzipBuffer, shouldCompress } from '../lib/compression'

// Un corps « JSON sérialisable par nous » : objet ou tableau simple. Un Buffer,
// un flux ou une chaîne déjà typée par le handler n'est pas concerné.
function isPlainJsonBody(body: unknown): body is Record<string, unknown> | unknown[] {
  if (body === null || typeof body !== 'object') return false
  if (Buffer.isBuffer(body)) return false
  // Flux (Readable, ReadableStream) : surtout ne pas consommer.
  if (typeof (body as { pipe?: unknown }).pipe === 'function') return false
  if (typeof (body as { getReader?: unknown }).getReader === 'function') return false
  return true
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', async (event, response) => {
    try {
      const body = (response as { body?: unknown }).body
      if (!isPlainJsonBody(body)) return

      const payload = JSON.stringify(body)
      const decision = shouldCompress({
        method: event.method,
        path: event.path,
        acceptEncoding: getRequestHeader(event, 'accept-encoding'),
        existingEncoding: getResponseHeader(event, 'content-encoding') as string | undefined,
        byteLength: Buffer.byteLength(payload)
      })

      // `Vary` est posé dès que la réponse POURRAIT être compressée selon
      // l'en-tête du client — sinon un cache intermédiaire pourrait servir une
      // variante gzippée à un client qui ne l'accepte pas.
      if (event.path.startsWith('/api/')) {
        setResponseHeader(event, 'vary', 'accept-encoding')
      }
      if (!decision) return

      const compressed = await gzipBuffer(payload)
      setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
      setResponseHeader(event, 'content-encoding', 'gzip')
      ;(response as { body?: unknown }).body = compressed
    } catch (error) {
      // Un échec de compression ne doit JAMAIS faire échouer la requête : la
      // réponse part en clair. Une réponse lisible vaut mieux qu'une 500.
      console.error('[compress-api] compression ignorée, réponse en clair :', error)
    }
  })
})
