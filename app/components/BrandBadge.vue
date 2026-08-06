<script setup lang="ts">
// BrandBadge — Pastille d'ENSEIGNE d'une station : logo de marque ou repli
// élégant (ticket 021). Affichage uniquement : le nom réel reste toujours en
// texte à côté (NFR-ACC-4), l'image est décorative (alt vide). Jamais une
// image cassée : l'URL est validée (utils/stationIdentity.ts) avant tout
// <img>, et un `onerror` neutre retire l'image si le logo venait à manquer.
// Sans logo, la pastille porte l'initiale de l'enseigne (⛽ si aucune).
import { computed, ref } from 'vue'
import { identityBadgeFor } from '../utils/stationIdentity'

const props = defineProps<{
  brand: string | null | undefined
  logoUrl: string | null | undefined
  name: string
  /** Variante compacte pour les badges de carte (16 px) vs liste (18 px). */
  size?: 'sm' | 'md'
}>()

const identity = computed(() => identityBadgeFor({ brand: props.brand, logoUrl: props.logoUrl, name: props.name }))
// L'erreur de chargement du logo (onerror) retire l'image ; l'initiale prend
// le relais — le nom de l'enseigne reste toujours affiché en texte.
const logoBroken = ref(false)

function onLogoError() {
  logoBroken.value = true
}
</script>

<template>
  <span class="brand-badge" :class="`brand-badge-${size ?? 'md'}`" data-testid="brand-badge">
    <img
      v-if="identity.logoUrl && !logoBroken"
      class="brand-badge-logo"
      :src="identity.logoUrl"
      alt=""
      width="18"
      height="18"
      loading="lazy"
      @error="onLogoError"
    >
    <span v-else class="brand-badge-fallback" aria-hidden="true">{{ identity.fallbackGlyph }}</span>
    <span class="brand-badge-label">{{ identity.label }}</span>
  </span>
</template>

<style scoped>
.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.55rem 0.15rem 0.2rem;
  border-radius: var(--r-pill);
  background: var(--slate-100);
  color: var(--text-700);
  border: 1px solid var(--border);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}
.brand-badge-sm {
  font-size: 0.72rem;
  padding: 0.1rem 0.45rem 0.1rem 0.15rem;
}
.brand-badge-logo {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 6px;
  object-fit: cover;
  object-position: center;
  background: var(--surface);
}
.brand-badge-sm .brand-badge-logo {
  width: 14px;
  height: 14px;
}
.brand-badge-fallback {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-700);
  border: 1px solid var(--border);
  font-size: 0.72rem;
  font-weight: 800;
}
.brand-badge-sm .brand-badge-fallback {
  width: 14px;
  height: 14px;
  font-size: 0.62rem;
}
</style>
