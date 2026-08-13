// server/lib/compression.ts — Décision de compression des réponses API
// (ticket 038). Vérifié sur le serveur bâti : Nitro ne compresse pas les
// réponses dynamiques (`compressPublicAssets` ne couvre que les fichiers
// statiques), donc /api/map/stations envoyait 879 Ko en clair pour la France
// entière — 127 Ko une fois gzippé.
//
// La décision vit ici, pure et testable. Le plugin Nitro
// (server/plugins/compress-api.ts) n'est qu'une glue I/O.
//
// La compression est un TRANSPORT : elle ne change aucune donnée. Aucune règle
// métier ici non plus — uniquement de la forme de réponse HTTP.
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

// Seuil ~1 MTU : sous cette taille, compresser ne gagne rien de perceptible et
// coûte du CPU à chaque requête. /api/health reste donc en clair.
export const MIN_COMPRESS_BYTES = 1_400

// Périmètre volontairement restreint à l'API. Le HTML SSR y gagnerait aussi,
// mais il passe par des chemins de rendu et de streaming différents : le gain
// ne justifie pas le risque (ticket 038).
const API_PREFIX = '/api/'

// `gzip;q=0` est un REFUS explicite (RFC 9110 §12.5.3). Chercher naïvement la
// sous-chaîne « gzip » enverrait une réponse que le client rejette.
export function acceptsGzip(acceptEncoding: string | undefined): boolean {
  if (!acceptEncoding) return false
  for (const part of acceptEncoding.toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';')
    if (name?.trim() !== 'gzip') continue
    const q = params
      .map((p) => p.trim())
      .find((p) => p.startsWith('q='))
      ?.slice(2)
    // Absence de q ⇒ q=1 (accepté). q=0 ⇒ refusé.
    return q === undefined || Number(q) > 0
  }
  return false
}

export function shouldCompress(input: {
  method: string
  path: string
  acceptEncoding: string | undefined
  existingEncoding: string | undefined
  byteLength: number
}): boolean {
  // HEAD n'a pas de corps à compresser.
  if (input.method.toUpperCase() === 'HEAD') return false
  if (!input.path.startsWith(API_PREFIX)) return false
  // Jamais de double encodage : le corps deviendrait illisible.
  if (input.existingEncoding) return false
  if (input.byteLength < MIN_COMPRESS_BYTES) return false
  return acceptsGzip(input.acceptEncoding)
}

// gzip ASYNCHRONE : compresser 879 Ko en synchrone bloquerait la boucle
// d'événements pendant des dizaines de millisecondes, sur un serveur qui tourne
// sur un petit Droplet.
//
// gzip et non brotli : brotli compresse ~20 % mieux mais coûte bien plus de CPU
// par requête — le gain marginal ne le justifie pas ici.
export async function gzipBuffer(payload: string | Buffer): Promise<Buffer> {
  return await gzipAsync(payload)
}
