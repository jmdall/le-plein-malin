# ADR-0001 : Suivi du travail en markdown local

- **Date** : 2026-08-03
- **Modifié** : 2026-08-07
- **Statut** : Accepté
- **Décision** : Les tickets vivent dans `docs/tickets/` (markdown local, un
  fichier par ticket), pas dans GitHub Issues.

## Contexte
Le cahier des charges (§19) interdit initialement tout push et toute PR, et le
dépôt n'a pas de remote. Les skills `to-tickets`/`implement` nécessitent un
issue tracker.

## Décision révisée (2026-08-07)
Le dépôt dispose désormais d'un remote `origin` (`git@github.com:jmdall/le-plein-malin.git`)
et la branche `main` y est poussée après chaque chantier. L'interdiction de
**PR** est conservée (on travaille en direct sur `main`, pas de pull request),
mais le **push** vers `origin/main` est autorisé pour sauvegarder et partager le
travail. Le suivi du travail reste en markdown local (pas de GitHub Issues).

## Conséquences
- Un fichier `docs/tickets/NNN-slug.md` par ticket, statut en frontmatter.
- Pas de dépendance à `gh`/`glab` pour le suivi des tickets ; workflow
  utilisable hors-ligne.
- Le vocabulaire de triage par défaut est conservé sous forme de `status:`.
- Commits locaux petits, poussés sur `origin/main` après chaque chantier.
  Toujours pas de PR (pas de branche de feature, pas de merge request).
- Documenté dans `docs/agents/issue-tracker.md`.
