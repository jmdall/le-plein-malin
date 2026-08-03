## Agent skills

### Issue tracker

Tickets live as local markdown files under `docs/tickets/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — stored as `status:` in ticket frontmatter. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at repo root + ADRs in `docs/adr/`. See `docs/agents/domain.md`.

### Project rules (from cahier des charges)

- Model obligatoire pour OpenCode : `deepseek/deepseek-v4-flash` (API officielle DeepSeek, `https://api.deepseek.com/v1`). Ne jamais basculer sur un autre modèle.
- Skills Matt Pocock : `.agents/skills/` (installés par `npx skills add mattpocock/skills`).
- Stack cible : Nuxt 3, Vue 3, TypeScript strict, Nitro, SQLite, Drizzle ORM, Zod, Vitest, Playwright, ESLint, Docker, PWA.
- La logique de recommandation est un module métier pur (`calculateFuelRecommendation`) : aucune dépendance Nuxt/HTTP/SQLite/env.
- TDD obligatoire pour toute règle métier. Git : commits locaux petits, pas de push, pas de PR.
