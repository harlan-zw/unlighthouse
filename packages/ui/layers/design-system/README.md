# Design System

Design system layer: design language extended by every app. It owns UI primitives, tokens, fonts, motion, chart helpers, formatters, design vocabularies (`Status`, severity, health, data-viz palette), and cross-cutting UI affordances (eject, feedback widget contracts).

## Scope

**Owns:**
- UI primitives under `app/components/{container,data,element}/`
- Design tokens, fonts, motion, chart helpers
- Formatters and design vocabularies (`Status`, severity, health, data-viz palette)
- Cross-cutting UI affordances (eject, feedback widget contracts)
- CSS tokens and global stylesheet (`css/`)

**Depends on:** `@nuxtseo/core` (type-only per ADR-0042)

**Consumed by:** `apps/site`, `apps/pro`, `apps/admin`, `apps/brand-kit`.

## Rules

- Per ADR-0042 (pragmatic rule): MAY know domain *shapes*; MUST NOT import runtime services. No `useFetch`, [Drizzle](https://orm.drizzle.team), Caller, billing, auth, or `useRuntimeConfig` at module scope. [Storybook](https://storybook.js.org) test: renders with prop fixtures alone.
- Component placement per ADR-0029. Components MUST NOT be prefixed `Pro/Admin/Tool/Docs/Learn`; the layer name is the scope.
- One of only two layers (with `core`) every app extends.
