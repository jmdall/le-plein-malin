<script setup lang="ts">
// RecommendationError — État d'erreur compréhensible (ticket 010, spec §14,
// NFR-SEC-5 : jamais de données inventées — le message vient du serveur ou
// d'une erreur réseau explicite). Bouton « Réessayer ».
defineProps<{
  message: string
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <section class="error-card" role="alert" aria-live="assertive">
    <h2 class="error-title">Impossible d’obtenir la recommandation</h2>
    <p class="error-message">{{ message }}</p>
    <div class="error-actions">
      <button type="button" class="btn btn-primary" @click="emit('retry')">Réessayer</button>
    </div>
  </section>
</template>

<style scoped>
.error-card {
  display: grid;
  gap: 0.6rem;
  padding: 1rem 1.25rem;
  border: 1px solid #fca5a5;
  border-radius: 0.75rem;
  background: #fef2f2;
}
.error-title {
  margin: 0;
  font-size: 1.1rem;
  color: #991b1b;
}
.error-message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #7f1d1d;
}
.error-actions {
  display: flex;
  gap: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  html.dark .error-card {
    background: #450a0a;
    border-color: #7f1d1d;
  }
  html.dark .error-title {
    color: #fca5a5;
  }
  html.dark .error-message {
    color: #fecaca;
  }
}
</style>
