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
  <section class="insufficient-card card" data-testid="insufficient-data" role="note">
    <p class="pill pill-outline insufficient-badge">Données insuffisantes</p>
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
  gap: 0.45rem;
  padding: 0.85rem 1rem;
}
.insufficient-badge {
  margin: 0;
  align-self: start;
  font-size: 0.78rem;
}
.insufficient-reason {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--text-700);
}
.insufficient-suggest {
  margin: 0;
  font-weight: 600;
  font-size: 0.9rem;
}
.insufficient-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.insufficient-hint {
  font-size: 0.82rem;
  color: var(--text-700);
}
.insufficient-ignored {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-700);
}
</style>
