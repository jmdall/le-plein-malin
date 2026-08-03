---
id: 013
titre: Profil véhicule + favoris + historique de consultation + mode sombre
statut: done
dependances:
  - "009"
  - "011"
priorite: P2
estimation: L
---

# 013 — Profil véhicule, favoris, historique et préférences

**Ce que ça livre :** les fonctionnalités personnelles du parcours de
configuration (§4) : **profil véhicule** complet (conso, capacité, niveau,
carburant, quantité souhaitée, seuil — validé par Zod, stocké en localStorage,
sans compte), la **liste des favoris** (épinglés en tête depuis 011), l'
**historique de consultation** et le **mode sombre** (préférence persistée). Un
profil absent ou partiel ne bloque jamais l'usage (VEH-4).

**Bloqué par :** 009 (API — profil envoyé pour la reco), 011 (favoris).

**Statut :** ready-for-agent

- [ ] Formulaire profil véhicule (VEH-1) : consommation L/100 km, capacité,
      niveau (L ou %), carburant, quantité souhaitée (optionnelle), seuil
      (défaut 1 €).
- [ ] Validation Zod (VEH-2) : conso > 0, capacité > 0, 0 ≤ niveau ≤ capacité,
      quantité ≥ 0, seuil ≥ 0 ; messages d'erreur accessibles.
- [ ] Stocké en localStorage (VEH-3) ; chargé et envoyé à l'API (009) pour la
      recommandation ; valeurs par défaut raisonnables si profil absent
      (VEH-4 — reco partielle).
- [ ] Carburant préféré mémorisé et présélectionné (CAR-2).
- [ ] Favoris : liste dédiée des stations favoris, épinglés en tête (STA-4/5),
      persistés en localStorage.
- [ ] Historique de consultation : dernière recommandation / stations visitées,
      accessible et vidable ; sert aussi d'appui à la tendance locale.
- [ ] Mode sombre : bascule clair/sombre persistée, contrastes AA dans les deux
      modes (NFR-ACC-2) ; ne dépend pas des couleurs seules (NFR-ACC-4).
- [ ] Navigation clavier + labels/aria sur tous les champs (NFR-ACC-1/3).
- [ ] Aucun compte utilisateur ; la position précise n'est jamais stockée côté
      client au-delà du rayon/ville (LOC-4).
- [ ] `npm run lint && npm run typecheck && npm run test` passe ; tests
      composables profil (validation Zod, persistance localStorage).
