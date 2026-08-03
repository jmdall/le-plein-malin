<script setup lang="ts">
// LocationSearch — Recherche par ville / code postal (ticket 010, LOC-2).
// Le formulaire déclenche une recherche sans géolocalisation ; la ville/CP
// est mémorisée localement. Labels et aide accessibles (NFR-ACC-3).
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
    <label class="sr-only" for="location-input">Ville ou code postal</label>
    <div class="location-row">
      <input
        id="location-input"
        v-model="value"
        class="location-input"
        type="text"
        inputmode="text"
        autocomplete="postal-code"
        :placeholder="placeholder ?? 'Ex. : Lyon ou 69001'"
      >
      <button type="submit" class="btn btn-primary">Rechercher</button>
    </div>
  </form>
</template>

<style scoped>
.location-form {
  display: grid;
  gap: 0.4rem;
}
.location-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}
.location-input {
  flex: 1 1 auto;
  min-height: 44px;
  padding: 0 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
}
.location-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
