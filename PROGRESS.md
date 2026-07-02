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
- D-032 (typed client → contracts; browser-portable read slice): done — moved client.ts to
  `@unlighthouse/contracts/client` (relative imports; removed core `./api/client` export, no shim).
  Added `util/gzip.ts` (fflate) + `util/base64.ts` (atob/btoa); swept node:zlib→util/gzip,
  node:crypto sha1→util/sha1, node:crypto md5(hashPathName)→sha1, node:buffer→Uint8Array across
  report/extract, api/dashboard, scan/route-audit, auditors/{mock,crux,dataforseo}, persist-events,
  util/{misc,fetch}, storage/{unstorage-blobs,drizzle/routes}, report/types. api/ws.ts keeps the
  Node global `Buffer` (ws.handleUpgrade demands Buffer; Node-only, never browser-bundled). New
  treeshake `browser-static` scenario (real assertion, passes). Deleted static-client BROWSER-COMPAT
  BLOCKER comment (work is done). Added `useIsStatic()` composable + eslint ui core-import boundary
  (regex allows only api/static-client). Static build wiring (build.ts snapshot embed, ci.ts
  --build-static, api.client.ts swap) was already present. Gate: typecheck green (11 pkgs);
  treeshake 7/7 incl browser-static; `nuxi generate` OK (8 routes); tests back to 589 after fixing
  test client imports + adding vitest alias for contracts/client. NOTE: full write-control gating via
  useIsStatic across components deferred (static client already rejects writes at runtime; safe).
- D-033 (CLI = registry projection via citty): NOT STARTED — before-snapshot captured
  (`.snapshots/cli-help-BEFORE.txt`, required by ground rule 5). Scoped: rewrite `cli/createCli.ts`
  on citty (root command byte-identical to the cac flags above); new `cli/project.ts`
  (`projectCliCommands` + `cittyFlagsFor(zodSchema)`); new `cli/agent-mode.ts` (NDJSON, `$schema`,
  exit codes from `cmd.exitCodes`); `cli/reporters/{ndjson,agent-summary}.ts`; three-leg parity test.
  GUARDRAIL to fold in: convert plain `Error` throws in `core/src/auditors/route/index.ts` (~lines
  76,106,157) to `UnlighthouseError` (`NOT_SUPPORTED` / new `NO_AUDITOR_AVAILABLE`) so exit-code
  mapping has typed codes. Tripwire: cac→citty parsing parity for `--no-cache`, comma-list flags
  (`--device`, `--urls`), dot-notation. Left for a fresh session per the handoff's per-decision note.
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
- NOTE: dist is gitignored; attw/publint read dist, so a build is required before running them.
- **Pre-existing `build:pkg` race** (`pnpm -r --filter './packages/**' run build`): the parallel run
  lets tsdown clean `@unlighthouse/contracts/dist` while a dependent (ui nuxi, core) resolves it,
  leaving dist incomplete and failing with `Rolldown failed to resolve import '@unlighthouse/contracts/*'`.
  Flaky (green at D-038 by scheduling luck). Deterministic fix: `pnpm -r --workspace-concurrency=1
  --filter './packages/**' run build` (verified green). Use serial build before attw/nuxi gates.
  Flagged for maintainer: consider making `build:pkg` serial or topological. Not a D-032 regression
  (standalone `nuxi generate` + serial `build:pkg` both green).

## Open conflicts / notes
- `src/types.ts` (unlighthouse) remains a labelled v0 re-export shim, intentionally kept: it is a
  public re-export (`export * from './types'` in `index.ts`) and not named in D-038's change list.
  Flagged in case the maintainer wants the `unlighthouse` package to stop re-exporting all of contracts.
