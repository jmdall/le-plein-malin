---
id: 020
titre: Noms réels et logos des stations — API (payloads enrichis)
statut: done
dependances:
  - "019"
priorite: P1
estimation: M
---

# 020 — API : noms réels et logos dans les réponses

**Ce que ça livre :** toutes les réponses API qui décrivent une station portent
le **nom réel**, l'**enseigne** et le **logo**. Le client n'a plus d'id
illisible à afficher et ne recalcule rien (REC-2/D1) : `ListedStation`,
`StationPrice`, la réponse de détail `/api/stations/:id` et la réponse de
recommandation véhiculent les champs enrichis.

**Bloqué par :** 019 (les données sont en base à la sync).

**Statut :** ready-for-agent

- [ ] `ListedStation` (et ses transports JSON) inclut `brand`, `brandWikidataId`,
      `logoUrl` — le nom réel est déjà `name` (019).
- [ ] `/api/stations` renvoie ces champs pour chaque station ET la station de
      référence ; le type `ListedStation` du client (`utils/stations.ts`) est
      mis à jour en miroir (aucun champ requis en plus : nullables).
- [ ] `/api/stations/:id` (détail) et `/api/recommendation` renvoient
      `brand`/`logoUrl` quand disponibles (jamais inventés : null si absents).
- [ ] Aucun calcul métier changé : uniquement le transport des nouveaux champs.
- [ ] Tests : les fixtures/payloads existants restent valides (champs ajoutés,
      nullables) ; des cas couvrent la présence de logoUrl/brand et leur absence
      (null) — pas de régression sur les tests API existants.
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

> Contexte : REC-2/D1 — le client ne calcule rien, il affiche ce que l'API
> renvoie. Ce ticket garantit que les nouveaux champs voyagent jusqu'à l'UI
> (021) sans casser les consommateurs existants (champs additionnels nullables).
