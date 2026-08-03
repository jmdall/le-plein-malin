---
id: 001
titre: Scaffold Nuxt 3 + TypeScript strict + ESLint + Vitest + Playwright + Docker
statut: done
dependances: []
priorite: P0
estimation: M
---

# 001 — Scaffold Nuxt 3 + TypeScript strict + ESLint + Vitest + Playwright + Docker

**Ce que ça livre :** un dépôt Nuxt 3 minimal et sain qui compile en TypeScript
strict, se linte, se teste (Vitest unit + Playwright e2e) et se construit — la
base sur laquelle toutes les autres tranches verticales s'appuient pour faire du
TDD dès le début.

**Bloqué par :** aucune — peut démarrer immédiatement.

**Statut :** ready-for-agent

- [ ] Nuxt 3 + Vue 3 scaffoldé ; `npm run dev` démarre l'app sur le port 3000.
- [ ] TypeScript strict activé dans `nuxt.config.ts` / `tsconfig` ; `npm run
      typecheck` passe.
- [ ] ESLint configuré (recommandé + TypeScript) ; `npm run lint` passe sans
      erreur sur le code scaffoldé.
- [ ] Vitest configuré ; un premier test de fumée (ex. utilitaire trivial)
      passe avec `npm run test`.
- [ ] Playwright configuré (navigateur installé) ; un premier test e2e de fumée
      (« l'app se charge ») passe avec `npm run test:e2e`.
- [ ] `npm run build` produit un build de production valide (Nitro compris).
- [ ] `.env.example` fourni (variables du provider, clé DeepSeek documentée pour
      OpenCode) ; `.env` est git-ignoré ; aucun secret committé.
- [ ] `docker-compose.yml` présent (service app + volume SQLite) et documenté.
- [ ] Structure de dossiers conforme au §12 du cahier des charges :
      `domain/{recommendation,fuel-prices,stations,vehicle}`, `server/`,
      `components/`, `pages/`, `composables/` (vides ou avec stubs).

**Scénarios de test liés :** aucun (tranche d'infrastructure). Elle débloque
l'exécution de la suite Vitest/Playwright pour toutes les tranches suivantes.
