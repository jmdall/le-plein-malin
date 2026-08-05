// composables/useFavorites.ts — Favoris de stations (ticket 011, spec §5.3
// STA-5). Persistés en localStorage (cohérent avec la table `favorites` serveur
// de 006 : même identifiant de station). Aucune règle métier : une simple
// collection d'ids. Toute erreur localStorage est neutralisée (utils/storage).
import { ref } from 'vue'
import { storageGet, storageSet, STORAGE_KEYS } from '../utils/storage'

export function useFavorites() {
  const favorites = ref<string[]>([])

  if (import.meta.client) {
    const stored = storageGet<unknown>(STORAGE_KEYS.favorites, [])
    favorites.value = Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []
  }

  function persist() {
    storageSet(STORAGE_KEYS.favorites, favorites.value)
  }

  function toggleFavorite(id: string): boolean {
    if (favorites.value.includes(id)) {
      favorites.value = favorites.value.filter((f) => f !== id)
    } else {
      favorites.value = [...favorites.value, id]
    }
    persist()
    return favorites.value.includes(id)
  }

  function isFavorite(id: string): boolean {
    return favorites.value.includes(id)
  }

  return { favorites, toggleFavorite, isFavorite }
}
