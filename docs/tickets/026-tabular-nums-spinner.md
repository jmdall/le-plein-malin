---
id: 026
titre: Prix en chiffres tabulaires + spinner dans le compteur de stations
statut: done
dependances: []
priorite: P3
estimation: S
---

# 026 — Chiffres tabulaires sur les prix + spinner de chargement des stations

**Ce que ça livre :** deux micro-retouches de lisibilité inspirées de
PouvoirAchat+ (docs/research/pouvoirachatplus-carte.md §5-4 et §5-2) :
(1) les prix et montants utilisent `font-variant-numeric: tabular-nums` pour que
les chiffres ne dansent pas entre lignes ;
(2) la pilule compteur « ⛽ N stations » (pages/index.vue) montre un spinner
pendant le chargement, à la place d'un compte trompeur ou figé.

**Bloqué par :** rien.

**Statut :** ready-for-agent

- [x] `font-variant-numeric: tabular-nums` (et `font-feature-settings: "tnum"`)
      appliqué aux prix/montants : `.jflp-price-badge-price`, `.station-price`,
      `.rec-amount-value`, `.rec-price`, `.rec-quantity`, et la valeur du compteur
      — via les tokens existants (assets/css/main.css), sans nouvelle police.
- [x] Pilule compteur (`.map-counter` dans pages/index.vue) : pendant
      `loading` (reco.state.status === 'loading'), afficher un petit spinner
      accessible (aria-hidden, animation respectant `prefers-reduced-motion`)
      + libellé « Recherche des stations… » au lieu du compte figé ; le compte
      réel (jamais inventé) revient une fois les données arrivées.
- [x] Aucune logique métier ni calcul nouveau : uniquement présentation
      (REC-2/D1), la valeur affichée reste `stationCount` réel.
- [x] `npm run lint && npm run typecheck && npm run test` passe ; vérification
      visuelle (liste + carte + bottom sheet, clair/sombre).

> Contexte : docs/research/pouvoirachatplus-carte.md §5-4 (tabular-nums) et
> §5-3 (pill de statut « N stations » + spinner). Le compteur ne doit jamais
> afficher un nombre inventé (CONTEXT.md — invariant « aucun prix/donnée
> inventée »).
