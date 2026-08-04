<script setup lang="ts">
// LocationSearch — Grande pilule de recherche flottant sur la carte (ticket
// 010, LOC-2 ; écran carte plein viewport, docs/design/ui-reference.md §1 :
// pilule blanche, ombre --shadow-md, icône loupe à gauche). Le formulaire
// déclenche une recherche sans géolocalisation ; la ville/CP est mémorisée
// localement côté page. Contrat @search inchangé.
import { ref } from 'vue'

defineProps<{
  placeholder?: string
}>()

const emit = defineEmits<{
  search: [query: string]
}>()

const value = ref('')

function submit() {
  const query = value.value.trim()
  if (query.length === 0) {
    return
  }
  emit('search', query)
}
</script>

<template>
  <form class="location-form" role="search" aria-label="Recherche par ville ou code postal" @submit.prevent="submit">
    <span class="location-icon" aria-hidden="true">🔍</span>
    <label class="sr-only" for="location-input">Ville, adresse ou code postal</label>
    <input
      id="location-input"
      v-model="value"
      class="location-input"
      type="text"
      inputmode="text"
      autocomplete="postal-code"
      :placeholder="placeholder ?? 'Rechercher une ville, une adresse…'"
    >
    <button type="submit" class="location-submit">Rechercher</button>
  </form>
</template>

<style scoped>
.location-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0 0.35rem 0 1rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  max-width: 100%;
}
.location-icon {
  flex: none;
  font-size: 1.05rem;
  color: var(--text-500);
  line-height: 1;
}
.location-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--text-900);
  font-family: inherit;
  font-size: 0.95rem;
}
.location-input::placeholder {
  color: var(--text-500);
}
.location-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: var(--r-pill);
}
.location-submit {
  flex: none;
  min-height: 44px;
  padding: 0 0.9rem;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s;
}
.location-submit:hover {
  background: var(--slate-100);
}
</style>
