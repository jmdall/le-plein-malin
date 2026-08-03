// server/providers/roulezoeco.ts — Repli priorité 3 (ADR-0003) : fichier XML
// quotidien de donnees.roulez-eco.fr (`/opendata/jour`, zip). Un seul
// téléchargement (~1 Mo zip → ~14 Mo XML), parsé en streaming (SAX) sans
// dépendance supplémentaire (zlib défalte, sax = dépendance transitive
// existante). La normalisation réutilise le module partagé ; les stations
// sans prix / en rupture / fermées sont exclues (CAR-3).
import { inflateRawSync } from 'node:zlib'
import { haversineKm } from '../../domain/fuel-prices/haversine'
import sax from 'sax'
import type { StationPrice } from '../../domain/fuel-prices/types'
import { normalizeRecord } from './normalize'
import type {
  FuelPriceProvider,
  NearbyStationQuery,
  ProviderResult
} from './types'

const ROULEZ_ECO_URL = 'https://donnees.roulez-eco.fr/opendata/jour'
const REQUEST_TIMEOUT_MS = 60_000

interface ZipEntry {
  name: string
  data: Buffer
}

// Mini-lecteur ZIP : ne gère que la compression « deflate » (méthode 8),
// utilisée par le fichier quotidien (vérifié : method 8). Central directory
// parcouru pour extraire le seul XML.
export function extractFirstXmlFromZip(zip: Buffer): Buffer | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 4 <= zip.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      // Fin des local headers (début central directory ou fin de fichier).
      break
    }
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = zip.subarray(nameStart, nameStart + nameLen).toString('utf8')
    const dataStart = nameStart + nameLen + extraLen
    const compressed = zip.subarray(dataStart, dataStart + compressedSize)

    if (method === 8) {
      entries.push({ name, data: inflateRawSync(compressed) })
    } else if (method === 0) {
      entries.push({ name, data: Buffer.from(compressed) })
    }
    // Méthode inconnue : on ignore l'entrée (jamais inventée).

    offset = dataStart + compressedSize
  }

  const xmlEntry = entries.find((e) => e.name.endsWith('.xml'))
  return xmlEntry ? xmlEntry.data : null
}

export type FetchLike = typeof fetch

export interface RoulezEcoOptions {
  url?: string
  timeoutMs?: number
  fetchFn?: FetchLike
}

interface Pdv {
  id: string
  address: string
  city: string
  postalCode: string
  lat: number
  lon: number
  closed: boolean
  rupturedFuels: Set<string>
}

// Extrait une valeur d'attribut : sax expose soit `Record<string, string>`
// (strict), soit `Record<string, { name, value }>` (non strict).
function attr(
  attrs: Record<string, unknown>,
  key: string
): string | undefined {
  const v = attrs[key]
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'object' && 'value' in (v as object)) {
    return (v as { value: string }).value
  }
  return undefined
}

export function createRoulezEcoProvider(
  options: RoulezEcoOptions = {}
): FuelPriceProvider {
  const url = options.url ?? ROULEZ_ECO_URL
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const fetchFn = options.fetchFn ?? globalThis.fetch

  return {
    name: 'roulez-eco',

    async findNearbyStations(query: NearbyStationQuery): Promise<ProviderResult> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let zip: Buffer
      try {
        const res = await fetchFn(url, { signal: controller.signal })
        if (!res.ok) {
          throw new Error(`Fichier roulez-eco : HTTP ${res.status}`)
        }
        zip = Buffer.from(await res.arrayBuffer())
      } finally {
        clearTimeout(timer)
      }

      const xmlBuffer = extractFirstXmlFromZip(zip)
      if (!xmlBuffer) {
        throw new Error('Fichier roulez-eco : aucun XML dans le zip')
      }

      // Les fichiers sont en ISO-8859-1 (en-tête XML) : on décode en latin1
      // pour préserver les accents avant de les passer au parser SAX.
      const xmlText = xmlBuffer.toString('latin1')

      const { lat, lon } = query.center
      const radiusKm = query.radiusKm
      const collected: StationPrice[] = []

      const parser = sax.parser(true, { trim: true })
      let pdv: Pdv | null = null
      let textField: 'address' | 'city' | null = null

      parser.onerror = (err) => {
        throw new Error(`Fichier roulez-eco : XML invalide (${err.message})`)
      }

      parser.onopentag = (node) => {
        const attrs = node.attributes as unknown as Record<string, unknown>

        if (node.name === 'pdv') {
          const latE6 = Number(attr(attrs, 'latitude'))
          const lonE6 = Number(attr(attrs, 'longitude'))
          pdv = {
            id: attr(attrs, 'id') ?? '',
            address: '',
            city: '',
            postalCode: attr(attrs, 'cp') ?? '',
            // Coordonnées roulez-eco en 1e-5 degrés (×100000), vérifié sur le
            // fichier réel : 4620100 → 46.201, 519800 → 5.198.
            lat: Number.isFinite(latE6) ? latE6 / 1e5 : NaN,
            lon: Number.isFinite(lonE6) ? lonE6 / 1e5 : NaN,
            closed: false,
            rupturedFuels: new Set()
          }
        } else if (pdv && node.name === 'adresse') {
          textField = 'address'
        } else if (pdv && node.name === 'ville') {
          textField = 'city'
        } else if (pdv && node.name === 'fermeture') {
          pdv.closed = true
        } else if (pdv && node.name === 'rupture') {
          const ruptureNom = attr(attrs, 'nom')
          if (ruptureNom) pdv.rupturedFuels.add(ruptureNom)
        } else if (pdv && node.name === 'prix') {
          // La rupture/fermeture est connue à la fermeture du pdv ; le prix
          // est émis ici mais la décision d'inclure se fait en fin de pdv,
          // quand tous les <rupture>/<fermeture> ont été lus. On stocke donc
          // les prix en attente.
          if (pdv) {
            pendingPrices.push({
              pdvId: pdv.id,
              name: attr(attrs, 'nom') ?? '',
              maj: attr(attrs, 'maj') ?? '',
              valeur: attr(attrs, 'valeur') ?? ''
            })
          }
        }
      }

      parser.ontext = (text) => {
        if (!pdv || !textField) return
        if (textField === 'address') pdv.address += text
        else if (textField === 'city') pdv.city += text
      }

      const pendingPrices: Array<{
        pdvId: string
        name: string
        maj: string
        valeur: string
      }> = []

      parser.onclosetag = (name) => {
        if (name === 'adresse' || name === 'ville') {
          textField = null
        }
        if (name === 'pdv' && pdv) {
          // Fin de station : on émet les prix non exclus.
          for (const p of pendingPrices) {
            if (pdv.id !== p.pdvId) continue
            if (pdv.closed) continue
            if (pdv.rupturedFuels.has(p.name)) continue
            const raw = {
              id: pdv.id,
              address: pdv.address,
              city: pdv.city,
              cp: pdv.postalCode,
              geom: { lon: pdv.lon, lat: pdv.lat },
              prix_nom: p.name,
              prix_valeur: p.valeur,
              prix_maj: p.maj
            }
            const normalized = normalizeRecord(raw, query.fuel)
            if (!normalized) continue
            // Filtrage spatial local : haversine pure du domaine.
            if (haversineKm({ lat, lon }, normalized.position) <= radiusKm) {
              collected.push(normalized)
            }
          }
          pdv = null
        }
      }

      // Le flux complet du XML décompressé est déjà en mémoire (Buffer).
      parser.write(xmlText).close()

      return {
        stations: collected,
        source: 'roulez-eco',
        syncedAt: new Date()
      }
    }
  }
}
