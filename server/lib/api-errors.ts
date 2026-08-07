// server/lib/api-errors.ts — Erreur structurée { error: { code, message } }.
// Aucune règle métier ici : uniquement le contrat d'erreur de l'API (spec §8).
// `isApiError` sert de garde dans les routes pour rejeter l'erreur structurée
// telle quelle (statusCode + body) au lieu d'un 500 générique.
export interface ApiError {
  statusCode: number
  body: { error: { code: string; message: string } }
}

export function createApiError(statusCode: number, code: string, message: string): ApiError {
  return { statusCode, body: { error: { code, message } } }
}

export function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    'body' in err &&
    typeof (err as ApiError).statusCode === 'number'
  )
}
