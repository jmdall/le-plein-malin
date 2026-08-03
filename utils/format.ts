// utils/format.ts — Formatage client (ticket 010). Module pur : aucune
// dépendance Nuxt/HTTP/localStorage. Les prix sont toujours affichés en €/L
// et jamais inventés : les valeurs viennent de l'API.
export function formatPrice(price: number): string {
  return `${price.toFixed(3).replace('.', ',')} €/L`
}

export function formatCurrency(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`
  }
  return `${km.toFixed(1).replace('.', ',')} km`
}

export function formatQuantity(litres: number): string {
  return `${litres.toFixed(0).replace('.', ',')} L`
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`
}

export function formatAgeLabel(ageInHours: number): string {
  if (ageInHours < 1) {
    const minutes = Math.round(ageInHours * 60)
    return minutes <= 1 ? 'il y a moins d’une minute' : `il y a ${minutes} min`
  }
  if (ageInHours < 24) {
    const hours = Math.floor(ageInHours)
    return hours <= 1 ? 'il y a 1 heure' : `il y a ${hours} h`
  }
  const days = Math.floor(ageInHours / 24)
  const hours = Math.floor(ageInHours % 24)
  return hours > 0 ? `il y a ${days} j ${hours} h` : `il y a ${days} j`
}

export function formatUpdatedAt(date: Date): string {
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
