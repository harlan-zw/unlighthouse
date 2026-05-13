# Contributing to Unlighthouse

Thanks for your interest in contributing. This doc covers the conventions, expectations, and tooling for landing changes in this repo.

## Philosophy

**Match what's there before adding something new.** Unlighthouse is a monorepo with deliberate package boundaries and established patterns. When you add code, default to the existing infrastructure — package placement, module shape, naming, dependency direction — unless there's a clear architectural or DX reason to deviate. If you think you have one, raise it in the PR description so it can be discussed before review.

This applies to:
- Which package code lives in (`core`, `unlighthouse`, `ui`, `mcp`, `cloudflare`, `contracts`).
- Public API surface — prefer extending existing hooks, options, or composables over inventing parallel ones.
- File organisation within a package — colocate with siblings rather than introducing new top-level folders.
- Dependency choices — check the pnpm catalog (`pnpm-workspace.yaml`) before adding a new dep.

## UI Work

All UI changes must reference [`DESIGN.md`](./DESIGN.md). It is the source of truth for:
- Voice and copy (CLI-shaped, noun-first, no marketing tone).
- Component composition and the "minimal, professional, editorial" principle.
- Score, severity, and metric conventions.

Read it before writing Vue. If a design rule is missing or wrong, update `DESIGN.md` in the same PR.

## Repo Layout

```
packages/
  core/         scan engine, queue, hooks, types
  unlighthouse/ CLI + Node API entry points
  ui/           Vue dashboard
  mcp/          MCP server
  cloudflare/   Cloudflare integration
  contracts/    shared schemas/types between packages
docs/           Nuxt-powered docs site (unlighthouse.dev)
test/           cross-package integration tests
```

Runtime code that crosses packages goes through `contracts`. Don't reach into a sibling package's internals.

## Workflow

1. **Fork & branch** off `main`.
2. **Install:** `pnpm i` (requires Node >= 20, pnpm 11).
3. **Stub:** `pnpm stub` once, so packages resolve to source.
4. **Make the change.** Keep the diff focused — one concern per PR.
5. **Verify:**
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test` (add or update tests for behaviour changes; failing test first for bug fixes)
6. **Commit** using conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Scope where it helps (`feat(ui):`, `fix(core):`).
7. **Open a PR** with: what changed, why, and any deviation from existing patterns. Link the issue if one exists.

## Code Style

- TypeScript, functional. Avoid classes.
- Let errors propagate unless recoverable; prefer `.catch()` over `try/catch`.
- No backwards-compatibility shims unless explicitly required — we delete freely.
- No inline/dynamic imports without a treeshaking justification.
- Vue: latest APIs (reactive prop destructure, array event defines). Prefer VueUse over raw browser APIs.
- ESLint is the arbiter; `pnpm lint` must pass.

## Tests

- Unit tests live next to the code (`*.test.ts`).
- Cross-package and CLI tests live in `test/`.
- For bug fixes: write the failing test first, then the fix.
- For new features: cover the happy path and at least one edge case.

## Docs

Docs live in `docs/`. If your change affects public API, CLI flags, or config, update the relevant page in the same PR. Run `pnpm docs` locally to preview.

## Issues

Before filing a bug, please include:
- Unlighthouse version + Node version.
- Minimal reproduction (a URL or repo is ideal).
- Full CLI output with `--debug`.

Feature requests: describe the use case before the proposed API. The "why" determines whether the "what" fits.

## Releases

Maintainers run `pnpm release`. Contributors don't need to bump versions or edit changelogs.

## Questions

Join the [Discord](https://discord.gg/275MBUBvgP) for one-on-one help, or open a GitHub Discussion for design-level questions.
