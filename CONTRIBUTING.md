# Contributing to Unlighthouse

Thanks for your interest in contributing. This doc covers the conventions, expectations, and tooling for landing changes in this repo.

## Philosophy

**Match what's there before adding something new.** Unlighthouse is a monorepo with deliberate package boundaries and established patterns. When you add code, default to the existing infrastructure — package placement, module shape, naming, dependency direction — unless there's a clear architectural or DX reason to deviate. If you think you have one, raise it in the PR description so it can be discussed before review.

This applies to:
- Which package code lives in (`contracts`, `core`, `audit-pool`, `unlighthouse`, `ui`, `mcp`, `cloudflare`).
- Public API surface — prefer extending existing hooks, options, or composables over inventing parallel ones.
- File organisation within a package — colocate with siblings rather than introducing new top-level folders.
- Dependency choices — check the pnpm catalog (`pnpm-workspace.yaml`) before adding a new dep.

## UI Work

All UI changes must reference [`DESIGN.md`](./DESIGN.md). It is the source of truth for:
- Voice and copy (CLI-shaped, noun-first, no marketing tone).
- Component composition and the "minimal, professional, editorial" principle.
- Score, severity, and metric conventions.

A few load-bearing rules that catch reviews most often:
- **Dark-only.** No `light:` Tailwind variants. The `ssr: false` + `colorMode.preference: 'dark'` config means light-mode pairs are dead code.
- **Stone palette is both primary and neutral.** No saturated brand colour in chrome — primary CTAs resolve to `bg-inverted` / `text-inverted`. Saturated colour is only allowed for `semanticColors` (status) and `cwvMetricColors` (LCP/INP/CLS identity).
- **No hardcoded `text-gray-*`, `bg-zinc-*`, hex codes, or backdrop-blur.** Use the `--ui-*` semantic tokens; status hex goes through `semanticColors`.
- **Severity collapses to 3 buckets** in `SeverityBadge`: `critical+serious → error`, `moderate → warning`, `minor+info → info`.
- **Single signal per row.** Don't stack a severity colour on the icon AND the badge — pick one slot.
- **Mono font** for URLs, route paths, response codes, selectors (`font-mono` + `truncate` + tooltip in tables).
- **`nums-tabular`** on every numeric readout (scores, durations, byte counts).

Read `DESIGN.md` before writing Vue. If a design rule is missing or wrong, update `DESIGN.md` in the same PR.

## Repo Layout

```
packages/
  contracts/    Zod schemas, command registry, port interfaces, Pack contract
  core/         scan engine, auditors, crawlers, storage, API handlers, built-in packs
  audit-pool/   tinypool-backed worker pool for parallel Lighthouse runs
  unlighthouse/ CLI host (bins: unlighthouse, unlighthouse-ci, unlighthouse-mcp)
  ui/           Nuxt 3 dashboard (dark-only, Stone palette — see DESIGN.md)
  mcp/          MCP server preset for AI agents
  cloudflare/   Cloudflare Workers preset (D1, R2, Durable Objects)
docs/           Nuxt-powered docs site (unlighthouse.dev)
test/           cross-package integration tests
```

Dependency direction is strict:

```
contracts        ← (peer: zod only)
   ↑
   └── core            ← peer of every preset
          ↑
          ├── ui            (types-only on core/api)
          └── mcp, cloudflare, unlighthouse  (presets)
```

Runtime code that crosses packages goes through `contracts`. Don't reach into a sibling package's internals. UI depends on `contracts` (+ `core` types) only — no runtime imports from `core`.

## Packs

Packs are the v1 unit of opinionated, multi-audit output (see `v1.md §D-028`). A pack picks a problem class, declares which Lighthouse audits it needs, and ships a reconciler that joins their output into a typed report. Built-ins live in `core/packs/*`; the contract is in `contracts/packs`.

When adding a new pack:
- One `core/packs/<name>.ts` file with the reconciler + Zod report schema + `Pack` definition.
- Register it in `core/packs/index.ts` under `builtInPacks`.
- One `ui/pages/results/[scanId]/packs/<name>.vue` page consuming `usePackRun`.
- Add a sidebar entry in `ui/layouts/site.vue`.
- Verify with `curl -X POST :5678/api/pack/run -d '{"scanId":"…","pack":"<name>"}'` against a live scan.

Third-party packs ship as `@unlighthouse-pack/<name>` and are merged in at host wiring time.

## Workflow

1. **Fork & branch** off `v1` (the active development branch; `main` is the v0 line).
2. **Install:** `pnpm i` (requires Node ≥ 22, pnpm 11). Node 22 is set in every package's `engines.node`.
3. **Build packages:** `pnpm build:pkg` once. This is required before `pnpm cli` will run — the host depends on real build artefacts (especially the tinypool worker file, which can't be stubbed).
4. **Run the dev loop:**
   - Terminal A: `pnpm cli --site https://example.com --no-open` boots the backend on `:5678` with CORS open.
   - Terminal B: `cd packages/ui && pnpm dev` runs HMR on `:3000`, talking to the backend via `runtimeConfig.public.unlighthouseApiUrl`.
   - Backend code changes: stop terminal A, `pnpm --filter @unlighthouse/core run build` (or `pnpm build:pkg`), then restart `pnpm cli`.
   - UI code changes: Vite HMR picks them up live.
5. **Make the change.** Keep the diff focused — one concern per PR.
6. **Verify:**
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test` (add or update tests for behaviour changes; failing test first for bug fixes)
7. **Commit** using conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Scope where it helps (`feat(ui):`, `feat(packs):`, `fix(core):`).
8. **Open a PR** against `v1` with: what changed, why, and any deviation from existing patterns. Link the issue if one exists.

### Stub mode (`pnpm stub`)

obuild's `--stub` mode is wired up for cases where you're iterating on a non-host package and a separate consumer (tests, another package's typecheck) needs to see your changes without a full build. It re-exports `dist/*.mjs` straight from `src/*.ts`. **Don't rely on it for `pnpm cli`** — the CLI's worker pool spawns fresh Node processes that can't load `.ts` re-exports. Run `pnpm build:pkg` for any flow that touches the runtime host.

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
