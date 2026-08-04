---
id: 017
titre: Noms réels et logos des stations — dérivation d'enseigne par libellé d'adresse
statut: ready-for-agent
dependances:
  - "016"
priorite: P1
estimation: S
---

# 017 — Dérivation d'enseigne par libellé d'adresse

**Ce que ça livre :** pour les stations où OSM n'a rien (hors périmètre de 018),
le nom d'affichage et l'enseigne peuvent être dérivés du libellé d'adresse réel
(ex. « CARREFOUR — 12 rue … » → nom « Carrefour », enseigne « Carrefour »).
C'est le repli du mode hybride (017 + 018) décidé pour ce chantier. Aucun logo
ici — uniquement le texte.

**Bloqué par :** 016 (colonnes `brand`/nom nécessaires pour recevoir le résultat).

**Statut :** ready-for-agent

- [ ] Module pur `deriveBrandFromAddress(address: string, city: string): { name: string; brand: string | null } | null`
      (dans `domain/` — aucune dépendance Nuxt/HTTP/SQLite, TDD obligatoire).
- [ ] Reconnaît les enseignes connues (mots-clés en français : Total,
      TotalEnergies, Intermarché, Carrefour, Auchan, E.Leclerc, Super U, Système
      U, Esso, BP, Shell, Avia, Eni, Elan, Leclerc, Géant, Casino, etc.) — liste
      minimale couvrant les plus fréquentes, ordre de correspondance déterministe.
- [ ] Ne fabrique jamais un nom quand il n'y a pas de correspondance : retour
      `null` et l'appelant garde le nom par défaut (id).
- [ ] Le module est pur (testé en Vitest sans réseau), les cas ci-dessus couverts.
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

> Contexte : le flux officiel ne publie pas l'enseigne (docs/research/fuel-data-source.md
> §7, spec §2.2 « hors périmètre MVP » — réintégré ici comme repli). Ce module
> sera branché par 019/020 ; ce ticket ne fournit que la logique pure testée.
