<script setup lang="ts">
// app.vue — Layout global (ticket 013). Navigation accessible (skip-link,
// NFR-ACC-1), header avec liens vers l'accueil / profil / favoris / historique,
// sélecteur de thème clair/sombre (010) visible sur toutes les pages.
// VitePwaManifest injecte le <link rel="manifest"> PWA (ticket 014).
</script>

<template>
  <div class="app-shell">
    <VitePwaManifest />
    <a class="skip-link" href="#main">Aller au contenu principal</a>

    <header class="app-header">
      <NuxtLink to="/" class="app-brand" aria-label="Accueil — Je fais le plein ou non ?">
        ⛽ Je fais le plein ou non&nbsp;?
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
.app-shell {
  display: grid;
  gap: 1rem;
}
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  padding: 0.6rem 1rem;
  background: var(--accent);
  color: var(--accent-contrast);
  border-radius: 0 0 0.5rem 0;
}
.skip-link:focus {
  left: 0;
}
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: var(--surface-raised);
  border-bottom: 1px solid var(--border);
}
.app-brand {
  font-weight: 700;
  text-decoration: none;
  color: var(--text);
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.app-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.nav-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 0.7rem;
  border-radius: 0.5rem;
  text-decoration: none;
  color: var(--text);
}
.nav-link:hover {
  background: var(--surface);
}
.nav-link-active {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
.theme-toggle {
  margin-left: auto;
}
</style>
