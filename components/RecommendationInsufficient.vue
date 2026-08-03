<script setup lang="ts">
// RecommendationInsufficient — « Données insuffisantes » avec suggestions
// (ticket 010, spec §4 parcours d'erreur, §11 #18 : élargir le rayon ou
// changer de carburant). Les suggestions passent par des boutons cliquables.
import { INSUFFICIENT_SUGGESTIONS, type Recommendation } from '../utils/recommendation'

defineProps<{
  recommendation: Recommendation
}>()

const emit = defineEmits<{
  widenRadius: [value: number]
}>()
</script>

<template>
  <section class="insufficient-card" data-testid="insufficient-data" role="note">
    <h2 class="insufficient-title">Données insuffisantes</h2>
    <p v-for="(reason, i) in recommendation.reasons" :key="`reason-${i}`" class="insufficient-reason">
      {{ reason }}
    </p>
    <p class="insufficient-suggest">
      Suggestions&nbsp;:
    </p>
    <div class="insufficient-actions">
      <button
        v-for="opt in INSUFFICIENT_SUGGESTIONS"
        :key="opt.value"
        type="button"
        class="btn btn-secondary"
        @click="emit('widenRadius', opt.value)"
      >
        {{ opt.label }}
      </button>
      <span class="insufficient-hint">ou changez de carburant ci-dessus.</span>
    </div>
    <p v-if="recommendation.ignoredData.length > 0" class="insufficient-ignored">
      Données ignorées&nbsp;: {{ recommendation.ignoredData.join(' ; ') }}
    </p>
  </section>
</template>

<style scoped>
.insufficient-card {
  display: grid;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}
.insufficient-title {
  margin: 0;
  font-size: 1.15rem;
}
.insufficient-reason {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.insufficient-suggest {
  margin: 0;
  font-weight: 600;
  font-size: 0.95rem;
}
.insufficient-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.insufficient-hint {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.insufficient-ignored {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
