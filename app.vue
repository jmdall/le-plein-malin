<script setup lang="ts">
// app.vue — Shell global. Deux modes de layout :
//
//   • mode « carte » (route '/') : le header ne prend AUCUNE place dans le
//     flux. Le shell fait 100dvh, et les contrôles flottent au-dessus de la
//     carte en pilules séparées, comme docs/design/reference/ref-carte-mobile.png.
//   • mode « document » (/profil, /favoris, /historique) : header classique
//     dans le flux, restylé en pilules sur la palette chaude.
//
// Le shell expose deux gouttières aux descendants (déclarées avec un repli à 0
// dans assets/css/main.css) :
//   --header-h : place occupée en haut du viewport par le header flottant ;
//   --nav-h    : place occupée en bas par la barre d'onglets flottante.
// La page carte doit poser ses propres overlays entre ces deux valeurs.
//
// CHOIX DE NAVIGATION MOBILE (route carte, ≤ 768 px) : la nav passe en barre
// d'onglets flottante EN BAS, plutôt qu'un bouton menu. Deux raisons : elle
// reste à portée du pouce sur mobile, et surtout elle libère tout le haut de
// l'écran pour la recherche + le segmented control carburant, qui sont les
// overlays denses de la référence. Un bouton menu aurait ajouté un tap avant
// chaque navigation et un état ouvert/fermé à gérer au clavier.
//
// Conservés : skip-link (#main, NFR-ACC-1), aria-label, active-class,
// VitePwaManifest (ticket 014).
import { computed } from 'vue'

const route = useRoute()
const isMapRoute = computed(() => route.path === '/')
</script>

<template>
  <div class="app-shell" :class="isMapRoute ? 'shell-map' : 'shell-doc'">
    <VitePwaManifest />
    <a class="skip-link" href="#main">Aller au contenu principal</a>

    <header class="app-header">
      <NuxtLink to="/" class="app-brand" aria-label="Accueil — Je fais le plein ou non ?">
        <span class="app-brand-mark" aria-hidden="true">⛽</span>
        <span class="app-brand-name">Je fais le plein ou non&nbsp;?</span>
      </NuxtLink>

      <nav class="app-nav" aria-label="Navigation principale">
        <NuxtLink to="/" class="nav-link" active-class="nav-link-active" exact-active-class="nav-link-active">Accueil</NuxtLink>
        <NuxtLink to="/profil" class="nav-link" active-class="nav-link-active">Profil</NuxtLink>
        <NuxtLink to="/favoris" class="nav-link" active-class="nav-link-active">Favoris</NuxtLink>
        <NuxtLink to="/historique" class="nav-link" active-class="nav-link-active">Historique</NuxtLink>
      </nav>

      <DarkModeToggle class="theme-toggle" />
    </header>

    <NuxtPage />
  </div>
</template>

<style scoped>
/* ——— Skip-link (NFR-ACC-1) : au-dessus de tout, y compris des overlays
   Leaflet (z-index 1000) et du header flottant. ——— */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: var(--z-skip);
  padding: 0.6rem 1rem;
  background: var(--accent);
  color: var(--accent-contrast);
  border-radius: 0 0 var(--r-md) 0;
  font-weight: 600;
}
.skip-link:focus {
  left: 0;
}

/* ═══════════ Mode « document » (/profil, /favoris, /historique) ═══════════ */
.shell-doc {
  display: grid;
  gap: 1rem;
  /* Le header est dans le flux : rien à réserver en haut ni en bas. */
  --header-h: 0px;
  --nav-h: 0px;
}

.shell-doc .app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-overlay);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.shell-doc .theme-toggle {
  margin-left: auto;
}

/* ═══════════ Mode « carte » (route '/') ═══════════
   Le shell occupe exactement le viewport ; le header est `fixed`, donc hors
   flux : la page carte peut prendre 100 % de la hauteur. */
.shell-map {
  position: relative;
  height: 100vh;
  height: 100dvh;
  /* 44px de contenu + 2 × 8px d'encart : ce que le header mange en haut. */
  --header-h: 60px;
  --nav-h: 0px;
}

.shell-map .app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  padding-top: max(0.5rem, env(safe-area-inset-top));
  /* Pilules posées sur la carte : pas de fond ni de bordure de barre, et
     surtout pas de capture des clics entre les pilules (pan/zoom Leaflet). */
  background: none;
  border: none;
  pointer-events: none;
}
.shell-map .app-header > * {
  pointer-events: auto;
}

.shell-map .theme-toggle {
  margin-left: auto;
}

/* ═══════════ Marque ═══════════ */
.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  padding: 0 0.9rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-900);
  font-weight: 700;
  font-size: 0.95rem;
  text-decoration: none;
  white-space: nowrap;
}
.shell-map .app-brand {
  box-shadow: var(--shadow-md);
}
.shell-doc .app-brand {
  background: none;
  padding-left: 0;
}
.app-brand-mark {
  font-size: 1.15rem;
  line-height: 1;
}

/* ═══════════ Navigation ═══════════ */
.app-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.nav-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.85rem;
  border-radius: var(--r-pill);
  text-decoration: none;
  color: var(--text-700);
  font-size: 0.9rem;
  font-weight: 600;
  transition: background-color 0.15s, color 0.15s;
}
.nav-link:hover {
  background: var(--slate-100);
  color: var(--text-900);
}
.nav-link-active {
  background: var(--accent);
  color: var(--accent-contrast);
}

/* Sur la carte en desktop, la nav vit dans la rangée flottante du haut : elle
   devient une pilule blanche groupée pour se détacher des tuiles. */
.shell-map .app-nav {
  flex-wrap: nowrap;
  gap: 0.15rem;
  padding: 0.25rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

/* ═══════════ Carte, ≤ 768 px : nav en barre d'onglets flottante en bas ═════ */
@media (max-width: 768px) {
  .shell-map {
    /* 52px de barre + 8px d'encart bas : ce que la nav mange en bas. */
    --nav-h: 60px;
  }

  .shell-map .app-nav {
    position: fixed;
    left: 0.5rem;
    right: 0.5rem;
    bottom: max(0.5rem, env(safe-area-inset-bottom));
    top: auto;
    z-index: var(--z-overlay);
    display: flex;
    gap: 0.15rem;
    padding: 0.25rem;
  }
  .shell-map .nav-link {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 0.35rem;
    font-size: 0.78rem;
  }
}

/* ═══════════ Étroit (≤ 430 px) : la marque se réduit au pictogramme ═══════ */
@media (max-width: 430px) {
  .app-brand-name {
    /* Le nom accessible reste porté par l'aria-label du lien. */
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .app-brand {
    justify-content: center;
    min-width: 44px;
    padding: 0 0.6rem;
  }
  .app-brand-mark {
    font-size: 1.3rem;
  }
  /* Hors carte, la nav reste dans le flux : on la compacte pour qu'elle tienne
     sur une ligne plutôt que de repousser le contenu vers le bas. */
  .shell-doc .nav-link {
    padding: 0 0.55rem;
    font-size: 0.82rem;
  }
  /* Le sélecteur de thème doit tenir à côté de la marque dès 320 px : on
     compacte ses boutons (sélecteur robuste au renommage de ses classes). */
  .shell-map .theme-toggle :deep(button) {
    padding: 0 0.55rem;
    font-size: 0.78rem;
  }
}
</style>
