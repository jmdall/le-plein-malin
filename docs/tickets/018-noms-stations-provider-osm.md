---
id: 018
titre: Noms réels et logos des stations — provider OSM (Overpass + logos Wikidata)
statut: done
dependances:
  - "016"
priorite: P1
estimation: L
---

# 018 — Provider OSM (Overpass + logos Wikidata)

**Ce que ça livre :** une source de vérité pour le **nom réel** et le **logo** des
stations : OpenStreetMap. Les stations DGCCRF portent un `ref:FR:prix-carburants`
= leur id officiel (vérifié réel : `1000001` → « Carrefour Market »,
`1000012` → « Total », avec `brand:wikidata` = Q154037). Le provider interroge
Overpass sur les `amenity=fuel` ayant cet attribut, récupère enseigne + nom,
résout le logo via `brand:wikidata` (Wikimedia), et expose un résultat exploitable
par 019. Le matching est 1:1 par id DGCCRF.

**Bloqué par :** 016 (les colonnes `brand_wikidata_id`/`logo_url` reçoivent le
résultat).

**Statut :** ready-for-agent

- [ ] Module `server/providers/osmMetadata.ts` : interroge l'API Overpass
      (query `amenity=fuel` + `ref:FR:prix-carburants` sur une bbox/rayon) avec
      fetch + AbortController (timeout ~20 s), parse le JSON, déduplique.
- [ ] Extrait par station : `name` réel, `brand` (enseigne), `brandWikidataId`,
      et dérive `logoUrl` depuis Wikimedia (URL stable du logo de l'entité
      `brand:wikidata`) — résolution best-effort, jamais bloquante.
- [ ] Aucun prix n'est touché : le provider ne fournit que des métadonnées
      d'identité (nom/enseigne/logo), il ne modifie pas les `StationPrice`.
- [ ] Abstrait derrière une interface (même philosophie qu'un `FuelPriceProvider`,
      ADR-0003) : `name`, `findMetadataFor(stationIds: string[])`.
- [ ] Tolérance aux pannes : Overpass/Wikimedia indisponibles → retour vide,
      jamais d'erreur qui casse la chaîne de prix (repli 017 + id).
- [ ] Tests Vitest avec fixtures (réponse Overpass typique + mapping wikidata),
      pas de réseau dans la suite unitaire ; un test « live » optionnel skip si
      réseau indisponible (convention providers-live.spec.ts).
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

> Contexte : OSM = licence ODbL, mention de la source exigée — l'UI (021) devra
> l'afficher. Vérifié réellement : les stations testées matchent 1:1 via
> `ref:FR:prix-carburants`. Le logo vient de l'entité Wikidata de la marque
> (ex. TotalEnergies Q154037), URL dérivable du `brand:wikidata`.
