<script setup lang="ts">
// RecommendationLoading — État de chargement (ticket 010, spec §14) :
// skeleton chaud (tokens de la palette, pas de spinner bleu) avec des blocs de
// même gabarit que le contenu final, pour éviter les sauts de mise en page.
// L'animation de pulsation est coupée globalement par
// `prefers-reduced-motion: reduce` (assets/css/main.css).
defineProps<{
  label?: string
}>()
</script>

<template>
  <section class="loading card" role="status" aria-live="polite" aria-busy="true">
    <p class="loading-label">{{ label ?? 'Recherche de la meilleure station…' }}</p>
    <div class="skeleton skeleton-verdict" aria-hidden="true" />
    <div class="skeleton skeleton-amount" aria-hidden="true" />
    <div class="skeleton skeleton-line" aria-hidden="true" />
    <div class="skeleton skeleton-line short" aria-hidden="true" />
    <div class="skeleton-pills" aria-hidden="true">
      <div class="skeleton skeleton-pill" />
      <div class="skeleton skeleton-pill" />
    </div>
  </section>
</template>

<style scoped>
.loading {
  display: grid;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
}
.loading-label {
  margin: 0 0 0.15rem;
  font-size: 0.85rem;
  color: var(--text-700);
}
.skeleton {
  border-radius: var(--r-md);
  background: var(--slate-100);
  animation: pulse 1.4s ease-in-out infinite;
}
.skeleton-verdict {
  height: 1.4rem;
  width: 65%;
  border-radius: var(--r-pill);
}
.skeleton-amount {
  height: 1.9rem;
  width: 45%;
  border-radius: var(--r-pill);
}
.skeleton-line {
  height: 0.8rem;
  width: 100%;
}
.skeleton-line.short {
  width: 60%;
}
.skeleton-pills {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.15rem;
}
.skeleton-pill {
  height: 1.4rem;
  width: 5.5rem;
  border-radius: var(--r-pill);
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
