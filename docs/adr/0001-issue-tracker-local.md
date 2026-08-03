# ADR-0001 : Suivi du travail en markdown local

- **Date** : 2026-08-03
- **Statut** : Accepté
- **Décision** : Les tickets vivent dans `docs/tickets/` (markdown local, un
  fichier par ticket), pas dans GitHub Issues.

## Contexte
Le cahier des charges (§19) interdit tout push et toute PR, et le dépôt n'a pas
de remote. Les skills `to-tickets`/`implement` nécessitent un issue tracker.

## Conséquences
- Un fichier `docs/tickets/NNN-slug.md` par ticket, statut en frontmatter.
- Pas de dépendance à `gh`/`glab` ; workflow utilisable hors-ligne.
- Le vocabulaire de triage par défaut est conservé sous forme de `status:`.
- Documenté dans `docs/agents/issue-tracker.md`.
