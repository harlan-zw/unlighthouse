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
- D-033 (CLI = registry projection via citty): done — rewrote `cli/createCli.ts` on citty
  (`buildCli` = root scan/dashboard entry + `subCommands` from the registry). New `cli/project.ts`
  (`cittyFlagsFor` derives flags from Zod input; `projectCliCommands` nests dot-names →
  `unlighthouse scan start`; respects `cli.hidden`; one-shot `onComplete`/`onError` exit hooks). New
  `cli/ctx.ts` (`buildCliContext` mirrors mcp.ts storage wiring). New `cli/agent-mode.ts` (NDJSON +
  `$schema` stamping + `exitCodeForError` from `cmd.exitCodes`). New reporters `src/reporters/{ndjson,
  agentSummary}.ts` registered in the reporter index + `ValidReportTypes`. GUARDRAIL folded in:
  `auditors/route/index.ts` plain Errors → `UnlighthouseError` (`NO_AUDITOR_AVAILABLE` new code +
  `CONFIG_INVALID`). `ci.ts` keeps its own cac program via new `cli/cac-base.ts` (it is a CI runner,
  not a registry projection). Added `citty` dep (catalog). Verified: `--version`/`--help` render;
  full registry projects (scan/route/history/compare/assert/pack/query/events/manifest/health/ready/
  sites); `manifest` emits NDJSON w/ $schema, 35 commands, exits cleanly; root parse byte-identical to
  cac (cache:false from --no-cache, samples→number, comma-lists). New `test/cli-parity.test.ts` (41
  tests: third-leg parity + per-command flags + root-parse tripwires). Retargeted `test/cli.test.ts`
  to `parseRootArgs`. Gate: typecheck green; cli-parity 41/41. NOTE: undocumented cac camelCase flag
  aliases (`--extraHeaders`) dropped for the documented kebab (`--extra-headers`); citty `--help`
  format differs from cac (parse-result equivalence, not help-text bytes, per the tripwire). cac dep
  retained (used by cac-base for ci.ts). Before-snapshot at `.snapshots/cli-help-BEFORE.txt`.
  (`.snapshots/cli-help-BEFORE.txt`, required by ground rule 5). Scoped: rewrite `cli/createCli.ts`
  on citty (root command byte-identical to the cac flags above); new `cli/project.ts`
  (`projectCliCommands` + `cittyFlagsFor(zodSchema)`); new `cli/agent-mode.ts` (NDJSON, `$schema`,
  exit codes from `cmd.exitCodes`); `cli/reporters/{ndjson,agent-summary}.ts`; three-leg parity test.
  GUARDRAIL to fold in: convert plain `Error` throws in `core/src/auditors/route/index.ts` (~lines
  76,106,157) to `UnlighthouseError` (`NOT_SUPPORTED` / new `NO_AUDITOR_AVAILABLE`) so exit-code
  mapping has typed codes. Tripwire: cac→citty parsing parity for `--no-cache`, comma-list flags
  (`--device`, `--urls`), dot-notation. Left for a fresh session per the handoff's per-decision note.
- D-040 (per-row auditor provenance + sample pinning): done — `ExtractedMetricsSchema.auditor` +
  drizzle `auditor text` column (INIT_SQL + new migration `0003_add_auditor_column.sql` + additive
  ALTER); each adapter stamps its name via `attachExtractedRouteData(…, name)` (local/psi/cdp-connect/
  remote-lighthouse/dataforseo) or directly (mock/crux); route-audit copies `report.auditor` → row +
  `reconcileToContract`. `ReconciledReport.provenance` gains `auditor`/`auditors`/`concurrency` (all
  nullish — shape changed ONCE for D-040/D-041/D-042). Sample pinning: `AuditOpts.sample`, threaded
  by `auditSampled`; `routeAuditors` memoizes the pick per (url,device) for the sample group.
  NOTE: UI mixed-backend badge deferred (data flows via query.routes/scan.results already; pure
  display addition to routes-table).
- D-041 (splitCategoriesAuditor): done — `core/auditors/route/split.ts` (disjoint-category merge,
  per-category provenance, `split` row auditor when categories diverge, single-backend collapse,
  CONFIG_INVALID on unsupported/empty). Config `{ strategy: 'split', assignments }` in AuditorConfig +
  wired in `resolveAuditor`. Tests `test/auditor-provenance-split.test.ts` (6): sample pinning + split
  merge + validation. Gate: typecheck green; tests 637 pass/1 skip.
- D-034 (reconciled-report reader cutover): done — the codebase had already cut 3/4 readers by prior
  evolution: `processScanData` is a no-op (detail tables removed; work flows through packs);
  `generateClient` (build.ts) reads rows + reconciled via `buildStaticSnapshot` (only a screenshot
  fallback reads raw LHR); dashboard deep-dive reads the reconciled blob (`loadRouteContract`). The one
  genuine raw-LHR reader was `ci.ts` (CI reporter) — CUT to the reconciled report
  (`routeContractBlobKey` + `parseRouteContract`). To keep reporter output intact, added version-stable
  `numericValue` to the reconciled `AuditFinding` (atoms `AuditFindingSchema` + extract
  `ContractAuditFinding` + population) — csvExpanded's numeric columns need it. Expected lossy fields
  (Step G): category `id`/`title` fall back to the key; audit `numericUnit` dropped. Lint boundary:
  new `test/lhr-reader-boundary.test.ts` fails if any file outside {report/extract, scan/route-audit,
  packs/reconcile-context, api/dashboard, build.ts} reads a raw LHR blob via `lhrBlobKey`.
  NOTE on the gate's generateClient before/after snapshot: generateClient's data path was already
  reconciled-based (unchanged here), so its output is identical; the lossy diff lives in the ci.ts CI
  report, as designed. Gate: typecheck green; boundary + reporter tests pass.
- D-035 (core-owned finalizeScan; D1 parity): done (via subagent, gated by me) — items 1/2/4 were
  ALREADY core-owned by prior evolution: `finalizeScan` (core/scan/route-audit.ts) already computes
  scan.summary from routes.listForScan, writes pack auto-runs + the terminal `complete` row + emits
  `scan:complete`, and is already called by core.ts (CLI) AND ScanRunnerDO (Cloudflare). tracking.ts
  only called the no-op `processScanData` → removed that dead call (subscriber now does CLI-only
  manifest + CrUX). Substantive work: D1 `reports`/`comparisons` stubs replaced with REAL shared
  drizzle repos (`createReportRepositories`/`createComparisonRepository` exported from core drizzle;
  d1-r2 builds a `drizzle-orm/d1` handle + exposes `db`); added comparison/comparison_diffs/scan_crux
  + full scan_routes columns to D1 INIT_SQL. New `packages/cloudflare/test/d1-storage.test.ts` (6,
  real d1R2Storage over a better-sqlite3 D1 shim: compare.run/detail, scan.results, pack.run,
  compareScans persist-read). Maintainer runbook in cloudflare/examples/basic/README.md.
  Gate: typecheck green; full suite 644 pass/1 skip.
  KNOWN GAP (flagged, out of D-035 scope): the D1 raw-SQL route WRITER does not yet populate
  `report_blob_key`/`auditor`/`score_agentic_browsing`/`screenshot_blob_key` (columns added, values
  null on a real CF scan) — so route.get's reconciled deep-dive can't resolve report_blob_key on D1
  until the D-034/D-040 row-writer cutover reaches the D1 ingest path. Separate follow-up.
  MAINTAINER-FLAGGED: real Cloudflare (miniflare/workerd) deploy verification — runbook only, not
  attempted; a real miniflare/vitest-pool-workers test is the documented follow-up.
- D-036 (RateLimiter → port): done (subagent, gated by me) — new `contracts/ports/rate-limiter.ts`
  (`check`/`consume`/`remaining` per v1.md spec), exported via existing `./ports`. New
  `core/rate-limiters/unstorage.ts` (`createUnstorageRateLimiter`; there was no existing unstorage
  counter — only the in-memory `createTokenBucket`, kept). `rateLimitedPick(limiter)` check-then-consume
  (fine for the single-writer scan flow); `resolveAuditor` rate-limited strategy uses it.
  `RateLimiterDO` gains `createRateLimiterClient` implementing the port. ARCHITECTURE.md ports table +
  deferred-seams updated (broadcasting stays un-promoted). Tests updated + new port test.
  Gate: full typecheck green; suite 648 pass/1 skip.
- D-037 (published JSON Schemas + $schema stamping): done (subagent, gated by me) — new
  `contracts/scripts/emit-schemas.ts` (`buildSchemas()`/`emitSchemas()`; guarded main) wired into the
  contracts build (`tsdown && tsx scripts/emit-schemas.ts`) → emits 71 files to `dist/schemas/v1/`
  (per-command input/output + atoms bundle); `dist/schemas` added to `files`. `manifest` output extended
  (`.default()`-free) with `schemaBaseUrl`, per-command `inputSchemaUrl`/`outputSchemaUrl`, and
  `binaryEndpoints` (the 4 dashboard raw-binary escape hatches, `binary:true`). ($schema stamping seam
  was already in agent-mode.ts from D-033.) Test `test/emit-schemas.test.ts`. Gate: full typecheck
  green; targeted tests 293 pass; contracts build emits schemas (verified).
  MAINTAINER-FLAG: `tsx` is used by the contracts build but not declared as a dep (resolves from the
  workspace store; matches the repo's existing undeclared `dev:cli` tsx usage). Declaring it a contracts
  devDep would make the publish build fully reproducible.
- D-039 (seeds/route-definitions): done (subagent, gated by me) — new
  `core/src/seeds/route-definitions.ts` (`routeDefinitionSeeds`): scans Nuxt/Next page files, returns
  `{ seeds, matcher, definitions }`; static routes seeded, `matcher(url)` → routeName via
  most-specific-first compiled regexes. Node-only, own subpath export
  `@unlighthouse/core/seeds/route-definitions` (+ tsdown entry + vitest alias); NOT in the `./seeds`
  barrel. Threaded a small additive `routeMatcher` seam: `UnlighthouseCoreOptions` → `RouteAuditDeps`
  → `auditRoute` fills the EXISTING `routeName` column at ingest when the auditor left it null
  (Cloudflare omits it → Worker rows keep null). Config: `.default()`-free `RouteDefinitionsConfig`
  (pagesDir/framework/extensions) in contracts + mirrored on ResolvedUserConfig; host `resolveSeeds`
  fuses it via fuseSeeds, imperative pagesDir-absolute rule in `config/resolve.ts` (D-020). New
  treeshake scenario `seeds-barrel` (asserts the `./seeds` barrel excludes node:fs; control asserts the
  route-definitions bundle DOES include node:fs). Tests: seeds.test.ts (+6), treeshake (+1). Gate: full
  typecheck green.
- D-042 (perf-score honesty under concurrency): done — serial perf lane (option a),
  implemented as a driver-side gate over pool dispatch. New `audit-pool/serial-lane.ts`
  (`createSerialLane`, pure tail-chaining mutex) + exported `resolveMaxThreads` from
  `audit-pool/defaults.ts`. `createLocalAuditor` computes capabilities + effective
  concurrency at construction: `reliablePerfScores = !(parallelPerf && maxThreads>1)` so
  parallel-perf + reliable can NEVER co-occur. Per audit: perf-including calls
  (onlyCategories absent/empty OR contains 'performance') route through `perfLane` when
  `maxThreads>1` and mode is serial; non-perf dispatch direct → parallel. Under a combined
  (non-split) scan every call includes perf so the whole scan serializes; with the D-041
  split auditor perf serializes while a11y/seo sweep parallel. Effective concurrency
  (1 when serial-laned, else maxThreads) stamped onto `report.concurrency`; route-audit
  threads it into `reconcileToContract({ concurrency })` → provenance. Config knob
  `scanner.perfConcurrency: 'serial'|'parallel'` (contracts, `.default()`-free; imperative
  serial default lives in the auditor per D-020); wired via host `auditor.ts`. Docs:
  concurrency section + samples cross-ref note in `recipes/improving-accuracy.md`. Test
  `test/audit-pool-perf-lane.test.ts` (6, injected pool runner, no Chrome): serialize by
  default, all-categories treated as perf, non-perf parallel, parallel-mode flips
  reliablePerfScores false + overlaps, 1-thread stays reliable, concurrency stamp.
  Gate: typecheck green (contracts/core/unlighthouse); targeted tests 51/51 (+treeshake/
  core/handlers/errors 65/65). NOTE: the doc's older "Reduce Parallel Scans" section still
  references the v0 `puppeteerClusterOptions.maxConcurrency` shape — left untouched (out of
  D-042 scope), flag for a v0-residue cleanup pass.
- D-043 (local API hardening: Origin/Host, bind, /__launch, token): done — new pure guard module
  `packages/unlighthouse/src/server-guards.ts` (`checkApiOrigin`, `resolveLaunchPath`,
  `isLoopbackHostname`/`isExposedHost`/`normaliseOrigin`). server.ts: new exported `createApiOriginGate`
  (h3 middleware over `checkApiOrigin`) mounted after CORS, guarding `/api/**` incl. `/__launch` + the
  WS upgrade at `/api/ws` — cross-origin/untrusted-Host → 403. `/__launch` now runs `resolveLaunchPath`
  (root-constrained, traversal → 403) instead of the broken `replace`+`join`. Bind default → loopback:
  `constants.ts` server gains `hostname:'127.0.0.1'`; `--host` flag added to ROOT_ARGS + mapped to
  `server.hostname` in `pickOptions` (also honours `UNLIGHTHOUSE_HOST`); `--host 0.0.0.0` exposes (Host
  check relaxes, token becomes the barrier + a warn logs). Bearer token (item 4) was ALREADY present
  (`createBearerAuthGate` engaged by `UNLIGHTHOUSE_API_TOKEN`) — left intact. Cloudflare SSRF (item 6):
  `CreateCloudflareAppOptions.allowedTargets?: (url) => boolean|Promise<boolean>`, checked in
  `createCloudflareApp` scan.start path before the rate limiter/runner (default allow-all; multi-tenant
  MUST supply). Added 2 catalog keys (`host.launch_path_rejected`, `cloudflare.scan_target_rejected`).
  Tests: `test/server-guards.test.ts` (26: enumerated allow/reject rules + DNS-rebinding cross-origin →
  403 + /__launch traversal → 403, pure + h3-app-level via toWebHandler) and
  `packages/cloudflare/test/allowed-targets.test.ts` (3: reject/allow/default). Gate: unlighthouse +
  cloudflare typecheck green; targeted suites 108/108 (server-guards/auth-gate/cli/cli-parity/d1-storage/
  allowed-targets); config-resolve + e2e-http unaffected. Did NOT run full suite/attw/publint per scope.
- D-044 (retention + history.prune + BlobStore.list): done (subagent, gated by me) — `.default()`-free
  `RetentionConfig` (maxScansPerSite/maxAgeDays/keepCiBaselines; unlimited by omission) in contracts +
  ResolvedUserConfig. `BlobStore.list(prefix)` added to the port + implemented in unstorage-blobs
  (getKeys), memory (prefix filter), cloudflare R2 (paginated), and the wrap.ts proxy. New
  `core/scan/prune.ts` `pruneScans` — pure over the Storage port, oldest-first per site, dry-run mode,
  `keepCiBaselines` protects comparison-baseline scans (checked via comparisons.list); blob deletion
  enumerates `scans/<id>/` via list (no hardcoded keys). New `history.prune` command + handler
  (registry 35→36; parity assertions bumped in api-parity + e2e-http; cli-parity dynamic). Host
  auto-prunes non-fatally after scan:complete when retention configured. R2 lifecycle recipe in
  cloudflare examples README. Tests: prune.test.ts + storage-port BlobStore.list case. Gate: full
  typecheck green; suite 708 pass/1 skip; attw green; publint green modulo ui link.
- Docs follow-through (ARCHITECTURE.md, v1.md log, GAPS.md closures): done — ARCHITECTURE.md updated
  (client location + invariant, 36 commands + 3-leg parity, D1 real repos, legacy rows removed, new
  conventions); v1.md decisions log appended D-032..D-044 + D-022 recipe corrected + reader-cutover
  item closed; GAPS.md rows 1/2/5 + drift closed (untracked working doc). Committed 4dcd21aa
  (ARCHITECTURE.md + v1.md; GAPS.md left untracked with the other planning artifacts).

## FINAL STATUS: all 13 decisions (D-032..D-044) landed, each gated + committed. Final full gate:
typecheck green (11 pkgs), suite 708 pass / 1 skip, attw green, publint green modulo the known ui
`link:` (maintainer-owned). Commits: D-038 f775dc10, D-032 d6bb3ceb, D-033 a16aac22, D-040+D-041
bc2154b0, D-034 784c810c, D-035 d5882a00, D-036 2a121624, D-037 a1e0f92e, D-039 830fa965, D-042
d1f3b0d9, D-043 a95d8b3f, D-044 3faf9a5a, docs 4dcd21aa (+ checkpoint 10a396df).

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
