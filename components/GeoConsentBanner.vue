<script setup lang="ts">
// GeoConsentBanner — Bannière de consentement géolocalisation (ticket 010,
// LOC-1 : recommandée, NON bloquante — refuser n'empêche pas l'usage).
// Le consentement est mémorisé localement ; si l'utilisateur refuse, la
// recherche par ville / code postal reste disponible.
import { ref } from 'vue'

defineProps<{
  locating?: boolean
}>()

const emit = defineEmits<{
  accept: []
  refuse: []
}>()

const isVisible = ref(true)

function accept() {
  isVisible.value = false
  emit('accept')
}

function refuse() {
  isVisible.value = false
  emit('refuse')
}

function dismiss() {
  isVisible.value = false
}
</script>

<template>
  <section
    v-if="isVisible"
    class="consent-banner"
    role="region"
    aria-label="Géolocalisation"
  >
    <h2 id="geo-consent-title" class="consent-title">Autoriser la géolocalisation&nbsp;?</h2>
    <p class="consent-text">
      Pour vous recommander la station la plus proche, nous pouvons utiliser votre
      position. Vous pouvez aussi rechercher une ville ou un code postal sans
      géolocalisation. Votre position n’est jamais enregistrée.
    </p>
    <div class="consent-actions">
      <button type="button" class="btn btn-primary" :disabled="locating" @click="accept">
        {{ locating ? 'Localisation…' : 'Utiliser ma position' }}
      </button>
      <button type="button" class="btn btn-secondary" @click="refuse">
        Rechercher une ville / un code postal
      </button>
      <button type="button" class="btn btn-ghost" aria-label="Fermer la bannière" @click="dismiss">
        Fermer
      </button>
    </div>
  </section>
</template>

<style scoped>
.consent-banner {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
  padding: 1rem 1.25rem;
  display: grid;
  gap: 0.75rem;
}
.consent-title {
  font-size: 1.05rem;
  margin: 0;
}
.consent-text {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
