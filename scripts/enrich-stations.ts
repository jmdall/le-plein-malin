#!/usr/bin/env tsx
// scripts/enrich-stations.ts — Re-enrichissement d'identité des stations en
// base (ticket 019, correctif ticket 021 : marqueurs sans enseigne).
//
// Problème corrigé : la base contenait des stations avec name = id, brand =
// null et address = '' — l'enrichissement n'avait jamais pu s'appliquer
// (adresse non stockée + Overpass sans User-Agent). Ce script rattrape :
//   1. télécharge l'export JSON officiel (Opendatasoft) et remplit l'adresse
//      réelle de chaque station en base (le champ « adresse », jamais inventé) ;
//   2. résout l'identité via la chaîne du job (018) : OSM d'abord (nom réel,
//      enseigne, logo) puis repli dérivation adresse (017) — mêmes règles que
//      server/jobs/syncPrices.ts, aucun nom fabriqué (invariant CONTEXT.md) ;
//   3. écrit les colonnes d'identité (name, brand, brandWikidataId, logoUrl).
//
// Usage : `npx tsx scripts/enrich-stations.ts [--osm-only|--no-osm]`
//   --osm-only : ne PAS écrire l'adresse (OSM par-dessus les adresses déjà là).
//   --no-osm    : sauter OSM (dérivation adresse seule) — utile si Overpass est
//                 indisponible. La base conserve alors l'identité précédente.
// Le script est idempotent et tolérant aux pannes : un lot Overpass en échec
// retombe sur la dérivation adresse / l'identité existante, jamais null.
import { eq, isNotNull, ne } from 'drizzle-orm'
import { createDb } from '../server/db/client'
import { stations } from '../server/db/schema'
import { createOsmMetadataProvider } from '../server/providers/osmMetadata'
import { resolveStationIdentities, type ResolvedIdentity } from '../server/jobs/syncPrices'
import type { FuelType } from '../domain/fuel-prices/types'

const EXPORT_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants-quotidien/exports/json'
const EXPORT_TIMEOUT_MS = 120_000

const args = process.argv.slice(2)
const skipAddressWrite = args.includes('--osm-only')
const skipOsm = args.includes('--no-osm')

interface ExportRecord {
  id: string | number
  adresse?: string
  ville?: string
  cp?: string
}

async function fetchExport(): Promise<ExportRecord[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS)
  try {
    const res = await fetch(EXPORT_URL, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`Export JSON complet : HTTP ${res.status}`)
    }
    const json = (await res.json()) as unknown
    if (!Array.isArray(json)) {
      throw new Error('Export JSON complet : réponse non array')
    }
    return json as ExportRecord[]
  } finally {
    clearTimeout(timer)
  }
}

// Construit les StationPrice* (id + adresse réelle) pour la résolution
// d'identité du job. On ne garde que l'essentiel : la résolution ne lit que
// id/address/city — le prix et la position ne sont pas utilisés ici.
interface IdAddress {
  id: string
  address: string
  city: string
  postalCode: string
}

function buildIdAddresses(records: ExportRecord[]): Map<string, IdAddress> {
  const byId = new Map<string, IdAddress>()
  for (const raw of records) {
    if (typeof raw.id !== 'string' && typeof raw.id !== 'number') continue
    const id = String(raw.id)
    if (byId.has(id)) continue
    byId.set(id, {
      id,
      address: typeof raw.adresse === 'string' ? raw.adresse : '',
      city: typeof raw.ville === 'string' ? raw.ville : '',
      postalCode: typeof raw.cp === 'string' ? raw.cp : ''
    })
  }
  return byId
}

// Convertit une entrée en StationPrice minimal (ce que resolveStationIdentities
// attend : id + address + city).
function toStationPrice(entry: IdAddress) {
  return {
    id: entry.id,
    name: entry.id,
    brand: null,
    address: entry.address,
    city: entry.city,
    postalCode: entry.postalCode,
    position: { lat: 0, lon: 0 },
    fuel: 'Gazole' as FuelType,
    price: 0,
    updatedAt: new Date(0)
  }
}

async function main() {
  const { db, sqlite } = createDb()

  try {
    // 1. Toutes les stations en base.
    const dbStations = db.select().from(stations).all()
    console.log(`Stations en base : ${dbStations.length}`)
    if (dbStations.length === 0) {
      console.log('Rien à faire (base vide).')
      return
    }

    // 2. Adresses réelles depuis l'export officiel (jamais inventées).
    const exportById = skipAddressWrite ? new Map<string, IdAddress>() : buildIdAddresses(await fetchExport())
    const matched = dbStations.filter((s) => exportById.has(s.id))
    console.log(
      `Adresses réelles depuis l'export : ${matched.length}/${dbStations.length}`
    )

    // 3. Résolution d'identité (mêmes règles que le job 019) : OSM d'abord,
    //    repli dérivation adresse, sinon identité existante en base.
    const metadataProvider = skipOsm ? undefined : createOsmMetadataProvider()
    const toResolve = new Map(
      dbStations.map((s) => {
        const entry = exportById.get(s.id) ?? {
          id: s.id,
          address: s.address,
          city: s.city,
          postalCode: s.postalCode
        }
        return [s.id, toStationPrice(entry)]
      })
    )
    const identities = await resolveStationIdentities(toResolve, metadataProvider)

    // 4. Écriture : adresse + identité, en conservant la valeur existante si
    //    la résolution ne donne rien de mieux (jamais brand null par-dessus
    //    une enseigne réelle).
    let updated = 0
    let withBrand = 0
    for (const station of dbStations) {
      const identity = identities.get(station.id) as ResolvedIdentity | undefined
      const hasExistingBrand = station.brand !== null && station.brand !== station.id
      const betterIdentity = identity && identity.brand !== null
      const hasOsmOrDerived = identity && (identity.brand !== null || identity.name !== station.id)

      // Adresse : on la complète quand elle est vide ou provient de l'export.
      const newAddress = skipAddressWrite ? station.address : (exportById.get(station.id)?.address ?? station.address)
      const address = newAddress !== '' ? newAddress : station.address

      const finalIdentity = betterIdentity || hasOsmOrDerived
        ? identity
        : hasExistingBrand
          ? null // conserver l'identité existante (jamais écraser une enseigne réelle)
          : { name: station.id, brand: null, brandWikidataId: null, logoUrl: null }

      if (finalIdentity && (finalIdentity.brand !== null || finalIdentity.name !== station.id)) {
        db.update(stations)
          .set({
            name: finalIdentity.name,
            brand: finalIdentity.brand,
            brandWikidataId: finalIdentity.brandWikidataId,
            logoUrl: finalIdentity.logoUrl,
            address,
            city: exportById.get(station.id)?.city ?? station.city,
            postalCode: exportById.get(station.id)?.postalCode ?? station.postalCode,
            syncedAt: new Date()
          })
          .where(eq(stations.id, station.id))
          .run()
        updated++
        if (finalIdentity.brand !== null) withBrand++
      } else if (address !== station.address || exportById.get(station.id)?.city !== station.city) {
        // Seule l'adresse change (pas d'identité meilleure) : mise à jour légère.
        db.update(stations)
          .set({
            address,
            city: exportById.get(station.id)?.city ?? station.city,
            postalCode: exportById.get(station.id)?.postalCode ?? station.postalCode,
            syncedAt: new Date()
          })
          .where(eq(stations.id, station.id))
          .run()
        updated++
      }
    }

    console.log(`Stations mises à jour : ${updated}/${dbStations.length}`)
    console.log(`Stations avec enseigne (brand != null) : ${withBrand}`)

    // 5. Diagnostic final.
    const withBrandNow = db.select({ id: stations.id }).from(stations).where(isNotNull(stations.brand)).all().length
    const withName = db.select({ id: stations.id }).from(stations).where(ne(stations.name, stations.id)).all().length
    const withAddress = db.select({ id: stations.id }).from(stations).where(ne(stations.address, '')).all().length
    const withLogo = db.select({ id: stations.id }).from(stations).where(isNotNull(stations.logoUrl)).all().length
    console.log('Résultat en base :')
    console.log(`  name != id : ${withName}`)
    console.log(`  brand != null : ${withBrandNow}`)
    console.log(`  logo_url != null : ${withLogo}`)
    console.log(`  address != '' : ${withAddress}`)
  } finally {
    sqlite.close()
  }
}

main().catch((error) => {
  console.error('Échec du re-enrichissement :', error)
  process.exitCode = 1
})
