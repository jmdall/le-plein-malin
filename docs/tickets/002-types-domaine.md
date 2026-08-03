---
id: 002
titre: Types domaine carburants, stations et véhicule (domain/fuel-prices, domain/vehicle, domain/stations)
statut: done
dependances:
  - "001"
priorite: P0
estimation: S
---

# 002 — Types domaine carburants, stations et véhicule

**Ce que ça livre :** les contrats TypeScript purs et documentés du domaine
métier — les types `FuelType`, `GeoPoint`, `StationPrice`, `FreshnessInfo`,
`VehicleProfile` — posés **avant** tout module de calcul, afin que
`calculateFuelRecommendation` et le calculateur de tendance s'appuient sur un
vocabulaire unique (CONTEXT.md, spec §10.2). Le domaine ne dépend de rien
(Nuxt, HTTP, SQLite, env) : c'est le socle de la pureté du module.

**Bloqué par :** 001 (scaffold) — le code doit compiler dans un dépôt TS strict.

**Statut :** ready-for-agent

- [ ] `domain/fuel-prices/types.ts` exporte :
      `FUEL_TYPES = ['Gazole','SP95','SP98','E10','E85','GPLc'] as const`,
      `FuelType`, `GeoPoint`, `StationPrice` (avec `brand: string | null`,
      `updatedAt: Date`), `FreshnessInfo` (`ageInHours`, `status`, `score`).
- [ ] `domain/vehicle/types.ts` exporte `VehicleProfile` (conso > 0,
      capacité > 0, 0 ≤ niveau ≤ capacité, `preferredQuantity: number | null`,
      `savingsThreshold` défaut 1).
- [ ] `domain/stations/types.ts` exporte `CandidateWithDistance` et
      `FuelRecommendationInput` (spec §10.2).
- [ ] Aucun type de `domain/` n'importe de Nuxt, HTTP, SQLite ou
      `process.env` — vérifié par un test de dépendances (import interdit).
- [ ] Les types correspondent au glossaire CONTEXT.md (aucun terme ambigu
      nouveau sans mise à jour de CONTEXT.md).
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

**Scénarios de test liés :** socle des scénarios 1–18 (§13) testés en 003 ; un
test de fumée vérifie la pureté des modules (pas d'import hors domaine).
