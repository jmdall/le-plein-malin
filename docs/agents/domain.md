# Domain docs

- **Layout:** single-context
- **Files:**
  - `CONTEXT.md` at repo root — ubiquitous language and domain glossary (station candidate, station de référence, détour, économie brute, économie nette, fraîcheur, tendance, recommandation partielle, seuil de rentabilité)
  - `docs/adr/` — Architecture Decision Records for structuring decisions (one file per ADR: `NNN-title.md`)
- **Consumer rules:**
  - Before designing or modifying domain code, read `CONTEXT.md` and any relevant ADRs.
  - When a decision changes a documented term or architectural constraint, update `CONTEXT.md` / the affected ADR in the same commit.
  - New structuring decisions require a new ADR.

Rationale (ADR-0001): the app is a single Nuxt 4 project; no monorepo signals exist.
