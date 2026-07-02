# v1 Architecture Pivot — Implementation Progress

Tracking D-032..D-044 per ARCHITECTURE-PIVOT.md. One line per decision.
Status: `pending` / `in-progress` / `done` / `blocked (why)` / `maintainer-flagged`.

## Environment
- nuxt-use-query sibling checkout: **present** at `/home/harlan/pkg/nuxt-use-query`, symlinked into `packages/ui/node_modules`. Not a blocker.
- `@unlighthouse/contracts` `private:true`, version `0.0.0-v1`: maintainer-owned (release metadata). Do not change unilaterally.

## Execution order (gates must be green before next decision)
D-038 → D-032 → D-033 → D-040+D-041 → D-034 → D-035 → (D-036, D-037, D-039, D-042, D-043, D-044) → docs.

## Decisions
- D-038 (delete v0 residue): done — deleted untracked legacy client/cli dirs, src/process/* + src/cli/reporters/ shims, flipped index.ts to core/comparison, fixed 2 test imports + mcp/cloudflare descriptions. NOTE: `src/types.ts` shim kept (it is a public re-export via `index.ts`, not named in D-038's change list). Also fixed a pre-existing packaging bug: contracts exported `./logging` but tsdown.config had no entry for it (dist/logging missing) — added the entry; contracts publint now "All good!". Gate: typecheck green, tests 589 pass/1 skip (== baseline).
- D-032 (typed client → contracts; browser-portable read slice): pending
- D-033 (CLI = registry projection via citty): pending
- D-040 (per-row auditor provenance + sample pinning): pending
- D-041 (splitCategoriesAuditor): pending
- D-034 (reconciled-report reader cutover): pending
- D-035 (core-owned finalizeScan; D1 parity): pending
- D-036 (RateLimiter → port): pending
- D-037 (published JSON Schemas + $schema stamping): pending
- D-039 (seeds/route-definitions): pending
- D-042 (perf-score honesty under concurrency): pending
- D-043 (local API hardening: Origin/Host, bind, /__launch, token): pending
- D-044 (retention + history.prune + BlobStore.list): pending
- Docs follow-through (ARCHITECTURE.md, v1.md log, GAPS.md closures): pending

## Maintainer-flagged (never attempted by agent)
- Real Cloudflare deploy verification (D-035): runbook only.
- npm publish metadata / package `private` flags / deprecations (D-038 publish-time).

## Verification-gate baseline (established at D-038)
- `pnpm typecheck`: green (11 packages).
- `pnpm test`: 589 pass / 1 skip (56 files) — the reference count.
- `pnpm test:attw`: green across all packages (after full rebuild + contracts logging-entry fix).
- `pnpm test:publint`: green for all packages EXCEPT `@unlighthouse/ui`, which fails on the
  `nuxt-use-query` `link:../../../nuxt-use-query` dependency. This is the flagged environment
  item (maintainer-owned; ui is `private:true`, won't publish with the link). Treat "publint green"
  as "green modulo this known ui link:". Root `pnpm test:publint` therefore exits 1 by design until
  the maintainer vendors/publishes nuxt-use-query.
- NOTE: dist is gitignored; attw/publint read dist, so a `pnpm build:pkg` is required before running
  them. Parallel `-r` builds can transiently empty a package's dist mid-run; rebuild+gate a single
  package sequentially if a spurious "file does not exist" appears.

## Open conflicts / notes
- `src/types.ts` (unlighthouse) remains a labelled v0 re-export shim, intentionally kept: it is a
  public re-export (`export * from './types'` in `index.ts`) and not named in D-038's change list.
  Flagged in case the maintainer wants the `unlighthouse` package to stop re-exporting all of contracts.
