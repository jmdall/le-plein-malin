// server/lib/orchestration.ts — Point d'entrée de l'orchestration de l'API
// REST (ticket 009, spec §8). Le gros fichier historique a été découpé en 5
// modules (commit B) : ce fichier re-exporte leur surface pour que les routes
// et les tests n'aient rien à changer. Il est supprimé une fois les routes
// basculées sur les imports fins (commit C).
export * from './api-errors'
export * from './station-mapping'
export * from './recommendation-input'
export * from './vehicle-profile-mapping'
export * from './api-response-builder'
