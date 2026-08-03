<script setup lang="ts">
// RecommendationLoading — État de chargement (ticket 010, spec §14) :
// skeleton accessible (aria-busy) avec composants de même gabarit que le
// contenu final, pour éviter les sauts de mise en page.
defineProps<{
  label?: string
}>()
</script>

<template>
  <section class="loading" role="status" aria-live="polite" aria-busy="true">
    <p class="loading-label">{{ label ?? 'Recherche de la meilleure station…' }}</p>
    <div class="skeleton skeleton-title" aria-hidden="true" />
    <div class="skeleton skeleton-line" aria-hidden="true" />
    <div class="skeleton skeleton-line short" aria-hidden="true" />
    <div class="skeleton skeleton-row" aria-hidden="true" />
    <div class="skeleton skeleton-row" aria-hidden="true" />
  </section>
</template>

<style scoped>
.loading {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}
.loading-label {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-muted);
}
.skeleton {
  border-radius: 0.375rem;
  background: var(--surface-raised);
  animation: pulse 1.4s ease-in-out infinite;
}
.skeleton-title {
  height: 1.6rem;
  width: 70%;
}
.skeleton-line {
  height: 0.9rem;
  width: 100%;
}
.skeleton-line.short {
  width: 55%;
}
.skeleton-row {
  height: 2.6rem;
  width: 100%;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
