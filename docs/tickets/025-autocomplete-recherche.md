---
id: 025
titre: Autocomplete de la recherche ville/adresse (suggestions à la frappe)
statut: done
dependances: []
priorite: P2
estimation: M
---

# 025 — Autocomplete de la recherche ville / adresse

**Ce que ça livre :** à la frappe dans la pilule de recherche (LocationSearch),
l'utilisateur voit une liste de suggestions de villes/adresses (api-adresse de
data.gouv.fr), navigables au clavier (listbox/option), et la sélection lance la
recherche comme aujourd'hui. Calqué sur PouvoirAchat+ (débounce 250 ms, min 3
caractères, limit 6, `role=listbox`/`role=option`).

**Bloqué par :** rien.

**Statut :** ready-for-agent

- [x] Utiliser l'API publique `https://api-adresse.data.gouv.fr/search/?q=…&limit=6`
      (gratuite, sans clé, production française) **depuis le client** ; aucune
      position précise n'est transmise, uniquement le texte saisi (LOC-4).
- [x] Débounce 250 ms + minimum 3 caractères + annulation des requêtes obsolètes
      (AbortController) — une seule requête en vol à la fois, la plus récente gagne.
- [x] Liste de suggestions avec `role="listbox"`, chaque item `role="option"`
      (aria-selected), navigation clavier (↑/↓, Entrée pour choisir, Échap pour
      fermer), fermeture au clic extérieur.
- [x] La sélection déclenche le contrat `@search` existant de LocationSearch
      (aucun changement côté pages/index.vue) ; après sélection, le champ est
      vidé et la liste fermée.
- [x] Normalisation de la réponse (label, ville, code postal) dans un **module
      pur** `app/utils/autocomplete.ts` (pas de dépendance Nuxt) avec tests unit
      TDD (parsing GeoJSON features, choix du label, repli sur la valeur saisie).
- [x] Style dans les tokens existants (assets/css/main.css) : surface chaude,
      ombre --shadow-md, même pilule ; aucun spinner bleu ; `prefers-reduced-motion`.
- [x] Le champ reste utilisable sans JS (SSR) : les suggestions sont un
      amélioration progressive, le formulaire submit continue de fonctionner.
- [x] `npm run lint && npm run typecheck && npm run test` passe ; vérification
      visuelle (desktop + mobile, clair/sombre).

> Contexte : docs/research/pouvoirachatplus-carte.md §5-1 et §5-6 (recherche
> nationale, débounce 250 ms, listbox). Le géocodage serveur (Nominatim +
> repli api-adresse, server/lib/geocode.ts) reste inchangé — l'autocomplete est
> un service client additionnel pour la frappe, pas un remplacement.
