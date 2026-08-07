# Issue tracker

- **Type:** Local markdown
- **Location:** `docs/tickets/`
- **Format:** one markdown file per ticket: `docs/tickets/NNN-slug.md`
- **Workflow:** tickets are created by the `to-tickets` skill, implemented by the `implement` skill, and closed by moving them to a `done` status in the file frontmatter.
- **PRs as a request surface:** off (no PRs — work is pushed directly to `origin/main`, see spec §19 + ADR-0001 rev.)

Rationale (ADR-0001, revised 2026-08-07): the repo has a `origin` remote and `main` is pushed after each work item, but PRs are never opened (no feature branches, no merge requests). Local markdown files keep the full workflow (grill → spec → tickets → implement → review) usable without GitHub.

See `docs/agents/domain.md` for how the other engineering skills read this file.
