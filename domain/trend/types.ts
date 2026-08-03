import type { TrendSignal } from '../stations/types'

// domain/trend/types.ts — ticket 005, spec §5.7 (TRE-2/TRE-3) et §9.3.
// Module 100 % pur : l'historique est fourni en entrée, jamais lu de la base.
// Aucun import Nuxt/HTTP/SQLite/env (vérifié par tests/unit/domain-purity.spec.ts).

export interface PriceSnapshot {
  day: Date // jour de l'observation (snapshot quotidien, ADR-0004)
  price: number // €/L, dernier prix observé ce jour
}

export interface TrendInput {
  stationId: string
  fuel: string // FuelType
  now: Date // heure courante injectée (pureté : pas de Date.now() dans le module)
  snapshots: PriceSnapshot[] // historique quotidien (J−0, J−1, …, J−n)
}

export interface TrendIndicators {
  minPrice: number // prix minimum local sur la période
  averagePrice: number // prix moyen (moyenne arithmétique)
  medianPrice: number // prix médian (médiane, paire/impaire)
  deviationFromMedian: number // prix courant − médiane (écart absolu €/L)
  change24h: number | null // variation 24 h (J−1), €/L ; null si J−1 indisponible
  change24hPercent: number | null // variation 24 h relative ; null si J−1 indisponible
  change7d: number | null // variation 7 j (J−7), €/L ; null si J−7 indisponible
  change7dPercent: number | null // variation 7 j relative ; null si J−7 indisponible
  trend: TrendSignal // direction probable + magnitude, jamais une certitude (TRE-3)
  freshnessScore: number // 0..1, découle des règles 24 h / 48 h (TRE-5)
}
