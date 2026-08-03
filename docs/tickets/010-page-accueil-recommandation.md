---
id: 010
titre: Page accueil + recommandation + panneau « Voir le calcul »
statut: ready-for-agent
dependances:
  - "009"
priorite: P1
estimation: L
---

# 010 — Page accueil + recommandation + panneau « Voir le calcul »

**Ce que ça livre :** la page principale mobile-first (parcours utilisateur §4) :
bannière de consentement géoloc, rayon (5/10/20/30, défaut 10 km) et carburant
mémorisés localement, affichage immédiat de la **recommandation** (type, station
conseillée, prix, date de mise à jour, économie nette, explication synthétique),
du bouton « **Itinéraire** » et du bouton « **Voir le calcul** » qui ouvre le
panneau d'explication. L'UI **n'affiche que** les champs fournis par le module
(004) via l'API (009) — elle ne recalcule rien (REC-2/D1).

**Bloqué par :** 009 (API).

**Statut :** ready-for-agent

- [ ] Page principale utilisable sur écran ≤ 360 px (NFR-RES-1) ; contrôles
      tactiles ≥ 44 px (NFR-RES-2) ; navigation clavier + focus visible
      (NFR-ACC-1) ; contrastes AA clair et sombre (NFR-ACC-2).
- [ ] Bannière de consentement géoloc : recommandée, **non bloquante** — refuser
      n'empêche pas l'usage (LOC-1, parcours §4).
- [ ] Recherche par ville ou code postal quand la géoloc est refusée (LOC-2).
- [ ] Rayon défaut 10 km ; sélection 5/10/20/30 mémorisée localement (LOC-3,
      CAR-2 pour le carburant préféré).
- [ ] Affichage de la recommandation : type (5 valeurs), station conseillée,
      prix, date de mise à jour, économie nette, explication synthétique
      (reasons), fraîcheur, niveau de confiance ; boutons « Voir le calcul » et
      « Itinéraire ».
- [ ] Panneau « Voir le calcul » : calculs effectués, données utilisées/ignorées,
      hypothèses (détour ligne droite, prix candidat…), fraîcheur, `isPartial`
      explicite (REC-3), formulations de tendance jamais certaines (REC-4).
- [ ] États de chargement et d'erreur compréhensibles ; « Données insuffisantes »
      avec suggestions (élargir le rayon, changer de carburant) quand aucun
      candidat (spec §4, #18).
- [ ] Date/heure de mise à jour toujours affichée avec le prix (FRE-1).
- [ ] Mode sombre (clair/sombre).
- [ ] Composants/composables réutilisables (le même ensemble sert aux listes de
      011) ; aucune règle métier dupliquée côté client.
- [ ] `npm run lint && npm run typecheck && npm run test` passe ; un test
      composable (état de chargement/erreur) couvre la page.
