<script setup lang="ts">
// RecommendationError — État d'erreur compréhensible (ticket 010, spec §14,
// NFR-SEC-5 : jamais de données inventées — le message vient du serveur ou
// d'une erreur réseau explicite). Carte terracotta douce + bouton pilule
// « Réessayer ».
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
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-radius: var(--r-lg);
  background: var(--terracotta-bg);
}
.error-title {
  margin: 0;
  font-size: 1rem;
  color: var(--terracotta-strong);
}
.error-message {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--text-700);
}
.error-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
