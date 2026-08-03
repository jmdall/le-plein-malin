---
id: 015
titre: Tests e2e Playwright (parcours principal + validation finale + README)
statut: done
dependances:
  - "010"
  - "011"
  - "012"
  - "014"
priorite: P3
estimation: M
---

# 015 — Tests e2e Playwright, validation finale et README

**Ce que ça livre :** la tranche de fermeture : les **tests e2e Playwright** du
parcours principal (spéc §10.4 : l'UI est couverte par Playwright, parcours
principal uniquement), la **validation finale** complète du cahier des charges
§18 (`npm run lint && npm run typecheck && npm run test && npm run test:e2e &&
npm run build`) et le **README** complet (livrables §16).

**Bloqué par :** 010 (accueil/recommandation), 011 (liste), 012 (carte), 014
(PWA).

**Statut :** ready-for-agent

- [ ] Test e2e du parcours principal : consentement géoloc (ou ville/CP) →
      recommandation affichée (type, station, prix, date de mise à jour,
      économie nette) → liste des stations → badge de fraîcheur → favori →
      panneau « Voir le calcul » (calculs/hypothèses/partialité) → bouton
      « Itinéraire ».
- [ ] Test e2e du parcours sans géoloc : recherche ville/CP → référence =
      plus proche du centre, détour affiché, hypothèse « ligne droite A/R » dans
      les assumptions (§13 #16).
- [ ] Test e2e du parcours d'erreur : source indisponible → repli/cache marqué
      ou « Données insuffisantes » avec suggestions, sans prix inventé (§13 #17/
      #18) ; rendu sans JS des pages statiques (NFR-PWA-2).
- [ ] La suite e2e est reproductible (fixtures/API stubbée en local, pas de
      dépendance à la source officielle en CI).
- [ ] Validation finale exécutée et verte : `npm run lint`, `npm run typecheck`,
      `npm run test`, `npm run test:e2e`, `npm run build` (cahier des charges
      §18) — résultats exacts rapportés, aucun résultat inventé.
- [ ] README.md livré et complet : prérequis, installation, configuration
      DeepSeek pour OpenCode, lancement local + Docker, tests, variables
      d'environnement, source des données, synchronisation, algorithme de
      recommandation, limites du MVP (livrables §16).
- [ ] `docs/tickets/` : chaque ticket clôturé passe à `statut: done` dans son
      frontmatter à la fin de la tranche.
