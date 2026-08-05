<script setup lang="ts">
// GeoConsentBanner — Carte flottante discrète de consentement géolocalisation
// (ticket 010, LOC-1 : recommandée, NON bloquante — refuser n'empêche pas
// l'usage ; écran carte plein viewport, docs/design/ui-reference.md). Posée
// au-dessus de la carte sans jamais la recouvrir entièrement : largeur
// bornée, dismissible. Le consentement est mémorisé localement ; si
// l'utilisateur refuse, la recherche par ville / code postal reste
// disponible.
import { ref } from 'vue'

defineProps<{
  locating?: boolean
}>()

const emit = defineEmits<{
  accept: []
  refuse: []
  dismiss: []
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
  emit('dismiss')
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
  position: fixed;
  left: 0.75rem;
  right: 0.75rem;
  /* --sheet-peek (posée sur .map-page, pages/index.vue) : hauteur actuelle de
     la bottom sheet, héritée via les custom properties CSS — sans ça, la
     bannière se retrouverait sous la feuille (opaque), donc invisible. */
  bottom: calc(var(--nav-h) + var(--sheet-peek, 0px) + 0.75rem);
  /* Garde-fou : la bannière ne doit jamais remonter sous le header/recherche
     (en mobile la feuille est repliée quand elle est visible, voir
     pages/index.vue, mais sur des écrans très courts le contenu pourrait
     déborder). 7rem = recherche (44 px) + espace (8 px) + carburant (~52 px),
     la pile d'overlays du haut au-dessous de --header-h. */
  top: calc(var(--header-h) + 7.25rem);
  overflow-y: auto;
  z-index: var(--z-modal);
  max-width: 26rem;
  margin: 0 auto;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  padding: 0.9rem 1.1rem;
  display: grid;
  gap: 0.6rem;
}
.consent-title {
  font-size: 0.98rem;
  margin: 0;
}
.consent-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-700);
}
.consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@media (min-width: 1024px) {
  /* Centrée dans l'espace libre à droite du panneau latéral (23 rem + marge),
     à distance de la légende (bas-gauche) et du FAB + zoom (bas-droite). */
  .consent-banner {
    left: calc(50% + 12rem);
    right: auto;
    top: auto;
    bottom: calc(var(--nav-h) + 1.5rem);
    transform: translateX(-50%);
    margin: 0;
    overflow: visible;
  }
}
</style>
