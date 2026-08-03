---
id: 011
titre: Liste des stations (tri économie nette, fraîcheur, filtres, favoris)
statut: ready-for-agent
dependances:
  - "009"
  - "010"
priorite: P2
estimation: M
---

# 011 — Liste des stations + badges de fraîcheur + favoris

**Ce que ça livre :** la liste des stations (spec §5.3) : pour chaque station le
nom, l'enseigne si disponible, l'adresse, la ville, la distance, le carburant,
le prix, la date/heure de mise à jour, l'âge de la donnée, l'économie brute, le
coût du détour, l'économie nette et le bouton « Itinéraire » ; tri par économie
nette décroissante ; badges de fraîcheur (24 h / 48 h, STA-3) ; filtres
carburant et rayon ; favoris épinglés en tête et persistés en localStorage.

**Bloqué par :** 009 (API), 010 (composables/composants partagés, page accueil).

**Statut :** ready-for-agent

- [ ] Chaque ligne affiche l'ensemble des champs STA-1 (économie brute/nette et
      coût du détour inclus — fournis par le module via l'API).
- [ ] Tri par défaut : économie nette décroissante ; station de référence et
      non-rentables en bas ou masquables (STA-2).
- [ ] Badges de fraîcheur exacts : « frais » (≤ 24 h), « potentiellement
      obsolète » (24–48 h), « exclu des recommandations » (> 48 h) ; les prix
      > 48 h restent **toujours visibles** mais marqués (STA-3, FRE-3) ; les
      couleurs ne sont jamais le seul vecteur d'information (NFR-ACC-4).
- [ ] Filtres carburant (6) et rayon (5/10/20/30), mémorisés localement (STA-4).
- [ ] Favori par station (localStorage, cohérent avec la table `favorites` de
      006 si applicable, STA-5) ; favoris épinglés en tête (STA-4).
- [ ] Date/heure de mise à jour affichée avec le prix (FRE-1).
- [ ] Responsive jusqu'au desktop (NFR-RES-1) ; accessibilité (NFR-ACC-1/2/3).
- [ ] Un test e2e couvre le parcours « liste affichée + tri + badge » dans le
      ticket e2e (014) ; les règles métier ne sont pas dupliquées côté client.
- [ ] `npm run lint && npm run typecheck && npm run test` passe.
