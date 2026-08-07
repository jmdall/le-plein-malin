// domain/fuel-prices/detour.ts — Détour A/R d'une candidate vers une station
// (D2, ADR-0002). Module 100 % pur : aucune dépendance Nuxt/HTTP/SQLite/env.
// Hypothèse ligne droite aller-retour, identique en mode géolocalisé et en
// mode ville/CP (spec §4) : max(0, dist_c − dist_r) × 2. La source unique du
// calcul est ici : les appels serveur l'importent au lieu de le recoder.
export function computeDetourKm(candidateKm: number, referenceKm: number): number {
  return Math.max(0, candidateKm - referenceKm) * 2
}
