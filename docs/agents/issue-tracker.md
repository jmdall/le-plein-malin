# Issue tracker

- **Type:** Local markdown
- **Location:** `docs/tickets/`
- **Format:** one markdown file per ticket: `docs/tickets/NNN-slug.md`
- **Workflow:** tickets are created by the `to-tickets` skill, implemented by the `implement` skill, and closed by moving them to a `done` status in the file frontmatter.
- **PRs as a request surface:** off (no remote, no PRs — see spec §19)

Rationale (ADR-0001): the repo has no Git remote and the cahier des charges forbids pushing or opening PRs. Local markdown files keep the full workflow (grill → spec → tickets → implement → review) usable without GitHub.

See `docs/agents/domain.md` for how the other engineering skills read this file.
