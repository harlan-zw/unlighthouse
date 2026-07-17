# Architecture

How the Unlighthouse v1 monorepo is structured, for people (and agents) working *in* the repo. For the user-facing version see [`docs/4.architecture.md`](docs/4.architecture.md); for the full design rationale and decisions log (D-001…D-051) see [`v1.md`](v1.md). Shared vocabulary lives in [`CONTEXT.md`](CONTEXT.md).

## One-line model

A **ports-and-adapters** scan engine (`@unlighthouse/core`) sits behind a typed **command registry** (`@unlighthouse/contracts`). Every host (CLI, MCP, Worker, UI, custom) wires four ports and reads the same commands. What you see in the terminal, the browser, and an agent stays in sync because there is one source of truth.

```
   SeedSource[]  ──►  Crawler  ──►  Auditor (often AuditorRouter)
                       │  ▲              │
                       │  └─ core.run()  └── audits each URL
                       ▼
                    Storage (repositories + blob store)
                       │
                       └── @unlighthouse/core/api ──► client / http / ws / mcp ──► UI, agents
                                  │
        (Hookable bus: scan:* route:* assert:* compare:* quota:* log)
```

## The four ports (+ hookable spine)

The engine knows nothing about *where* it runs. Every runtime-specific concern is behind a port the host supplies. Interfaces live in `packages/contracts/src/ports/`.

| Port | Job | In-repo adapters |
|---|---|---|
| `SeedSource` | Produce URLs to scan (`seeds(): AsyncIterable<Seed>`) | `core/seeds/`: `sitemap`, `manual`, `fuse` (compose/dedup). CF: `workerSitemapSeeds` |
| `Crawler` | Drive the seed→audit loop (`run(): AsyncIterable<CrawlEvent>`) | `core/crawlers/`: `crawlee`, `parallel-map`. The CF app owns durable Workflow orchestration instead of implementing this port. |
| `Auditor` | Produce a Lighthouse report for one URL (`audit(url, page?, opts?)`) + advertise `capabilities` | `core/auditors/`: `local`, `cdp-connect`, `remote-lighthouse`, `psi`, `crux`, `dataforseo`, `mock`; `route/` (AuditorRouter). CF: Worker-safe Container transport over `remote-lighthouse` |
| `Storage` | Persist a scan's data | `core/storage/`: `drizzle` (rows), `unstorage-blobs`, `memory`. CF: `d1-r2` |
| `RateLimiter` | Gate audits against a quota bucket (`check` / `consume` / `remaining`) | `core/rate-limiters/`: `unstorage` (token bucket over any unstorage backend). CF: `createRateLimiterClient` over `RateLimiterDO` |

**Auditor capabilities** drive routing: `reliablePerfScores` (false for remote-CDP — network RTT contaminates LCP/TBT/SI), `reliableFieldData` (true for CrUX), `supportsThrottling` (false for fetch-based PSI/CrUX/dataforseo), and `categories`. `AuditorRouter` is itself an `Auditor` that takes a `pick(auditors, ctx)` function; composable pick helpers ship as `round-robin` / `weighted` / `rate-limited` / `fallback` / `predicate` picks so new strategies need no PR to `core`.

**Deferred seams** — a capability kept as an inline shape until a second adapter earns a real port:
- `Policy` — robots only (`core/policies/robots/`); exposed as `allows(url)` + `crawlDelayMs` on the crawler run options.
- `BrowserPool` — puppeteer-cluster only (`core/auditors/audit-pool/`), passed into `auditors/local`.
- **Fan-out / broadcasting** — host-owned and deliberately NOT promoted to a port. The CLI uses `wireWsBroadcast`; an optional `ScanEventsDO` adapter exists for custom Cloudflare hosts, while the maintained app polls D1. `core.run()` exposes `events` + `subscribe` + a 10k-event replay ring and lets each host decide fan-out.

`RateLimiter` graduated to a port (D-036) once it had two real adapters and a polymorphic consumer (`rateLimitedPick`); see the ports table above.

The `Hookable` bus is the cross-cutting event spine. Stable, schema-versioned events are typed in `packages/contracts/src/hooks/`: `scan:{created,started,discovering,scanning,progress,route-complete,route-failed,paused,resumed,cancelled,complete,error}`, `route:{queued,html-extracted}`, `assert:{passed,failed}`, `compare:complete`, `quota:{exceeded,depleted}`, `log`. Adapter-internal `CrawlEvent`s (`url-discovered/started/completed/failed/idle`) are ephemeral and get translated into stable `scan:*` events by the factory.

## The factory and the host

`createUnlighthouseCore(opts)` (`packages/core/src/core.ts`) is the only engine factory — the v0 `createUnlighthouse` / `UnlighthouseContext` / `useLogger()` singletons are gone. Six keys, ~600 LOC of orchestration behind them:

```ts
createUnlighthouseCore({
  config,   // already resolved by the host (c12 + env + rules); Zod-validated inside
  auditor,  // single, may be an AuditorRouter
  seeds,    // single, may be fuseSeeds([...])
  crawler,  // single: crawlee / parallel-map / custom
  storage,
  hooks?,   // additive subscribers merged into the bus
  logger?,  // ConsolaInstance; tagged per adapter via logger.withTag(name)
}): UnlighthouseCore
```

`core.run({ overrides? })` returns a `CrawlSession` (single-session: a second `run()` throws `ACTIVE_SCAN_CONFLICT`). Per-run `overrides` (site, device/device-matrix, mode, categories, sampleSize, auditor, ciBuild) merge on top of `config` for one session without mutating shared state. The factory hides scanId minting, the AbortController, `CrawlEvent`→`scan:*` bridging, pause/resume delegation, tagged loggers, and storage writes. `reapStaleScans` marks non-terminal scans from a crashed process as `error` at boot. The shared scan lifecycle (`core/scan/lifecycle.ts`) owns site/scan creation, status and progress persistence, terminal transitions, and lifecycle hook emissions. Per-route auditing and aggregation remain in `core/scan/route-audit.ts`. Both modules are runtime-neutral, so Cloudflare Workflows can reuse them outside the local crawler loop.

**`createUnlighthouseHost`** (`packages/unlighthouse/src/host.ts`) is the CLI/server-side wrapper around the factory. It lazily wires the default adapters behind Proxies (`ensurePorts()`), resolves config, mounts WS broadcast + the history subscriber, builds the `HandlerCtx`, and owns the h3 server lifecycle. Multi-tenant hosts (a CF Worker per request) skip the host and spawn one core per scan directly.

## The command registry

`@unlighthouse/contracts/commands` is **the source of truth** — 36 typed `{ name, input, output, run }` commands (`define.ts`). Hosts project the registry into their transport and get every command for free; a client derives its routes from the same `commandToRoute` the server uses, so they can't drift (a CI parity test enforces coverage, now three-legged: HTTP, MCP, and the citty CLI — D-033).

Namespaces (`packages/contracts/src/commands/`): `scan.*` (start, status, cancel, pause, resume, delete, import, results, summary, meta, current, rescanAll, categories), `route.*` (get, audits, rescan), `history.*` (list, rescan, prune), `compare.*` (run, detail, markdown, findPrevious), `assert.evaluate`, `pack.*` (run, list), `query.routes`, `events.*` (subscribe, tail — streaming), `sites.*` (list, create, delete), and top-level `meta` (`manifest`, `health`, `ready`, `auditors.list`). Handlers live in `packages/core/src/api/handlers/`.

## The API layer

The typed client lives with the registry it is derived from: `@unlighthouse/contracts/client` (`createClient({ baseUrl })`: a typed proxy where `api['scan.start'](input)` maps to the derived HTTP route). It is a contracts artifact — its imports are already contracts-only — so it moved out of core (D-032); no re-export remains in core. `packages/core/src/api/` projects the registry over the wire:

- **`static-client.ts`** — `createStaticClient(snapshot)`: same client shape, served from an embedded snapshot for offline/static builds.
- **`http.ts`** — the h3 command router. **`ws.ts`** — the WebSocket event stream. **`mcp` projection** mirrors `http.ts` but emits MCP tools.
- **`dashboard.ts`** — `createDashboardApi(storage)`: a small raw-binary escape hatch (screenshot, route HTML, raw LHR, export) reached by URL, not the typed client. Domain reads all go through commands. `manifest` output lists these four endpoints as `binary: true` entries so the escape hatch is self-described (D-037).

**Client-import invariant (D-032).** The UI's live path imports `@unlighthouse/contracts/client` only; the static path additionally imports core's `api/static-client` read slice, which must be browser-portable — no `node:*` on the reachable path (`fflate` for gzip, the pure `util/sha1`, `Uint8Array`/`TextEncoder` in place of `Buffer`). CI-enforced by the `browser-static` treeshake scenario (`test/treeshake.test.ts`), which asserts the `contracts/client` + `core/api/static-client` bundle contains no `node:zlib`/`node:crypto`/`node:buffer`, `better-sqlite3`, `drizzle-orm`, `h3`, or `listhen`.

## Storage

`Storage` (`packages/contracts/src/ports/storage.ts`) is a set of repositories plus a blob store, not two flat primitives:

```ts
interface Storage {
  sites; scans; routes;      // relational repositories (rows)
  reports; comparisons; packRuns;
  blobs;                     // BlobStore: put/get/has/delete
  db?;                       // optional raw handle for legacy SQL-only flows
}
```

Rows are backed by **Drizzle** (sqlite dialect → `better-sqlite3` today, libsql/Turso, D1); blobs by **unstorage** (fs locally, R2 on Cloudflare). A `memory` adapter backs tests and lightweight custom hosts. Route identity is `(scanId, url, device)` so mobile and desktop results never collapse (D-029). `better-sqlite3` is the v1.0 default driver; `node:sqlite` is parked for v2. Migrations ship as SQL files read by drizzle-kit, not as a subpath export. On D1, `reports`/`comparisons` are real shared drizzle repositories (D-035 replaced the former stubs), and the D1 raw-SQL route writer populates the provenance + reconciled `report_blob_key` columns, so `compare.*`, pack drill-ins, and `route.get`'s reconciled deep-dive all return data on the Worker host.

## Packages

Dependency graph (no cycles): `contracts` ← `core` ← { `ui`, `mcp`, `cloudflare`, `unlighthouse` }. `unlighthouse` also bundles `ui` (static build) and `mcp`.

| Package | npm name | Role | Status |
|---|---|---|---|
| `contracts` | `@unlighthouse/contracts` | Types, ports, command registry, hooks, config schema, errors, packs contract, drizzle schema. Peer: zod, drizzle-orm. | Full |
| `core` | `@unlighthouse/core` | The engine: seeds, crawlers, auditors, policies, storage, report, comparison, packs, api (client/http/ws/dashboard/handlers). Peer: better-sqlite3, drizzle-orm, unstorage. | Full |
| `unlighthouse` | `unlighthouse` | CLI + host + public npm name. `createUnlighthouseHost`, config resolution (c12 + defu + Zod in `src/config/resolve.ts`), reporters, history subscriber. Owns bins `unlighthouse` / `unlighthouse-ci` / `unlighthouse-mcp`. Exports `.`, `./cli`, `./ci`, `./config`. | Full |
| `ui` | `@unlighthouse/ui` | Nuxt **SPA** dashboard (`ssr: false`). Consumes `@unlighthouse/contracts/client` via `nuxt-use-query` (live path); the static path also imports `@unlighthouse/core/api/static-client`. Builds to a static bundle (`dist/index.html`) embedded by the CLI host. | Full |
| `mcp` | `@unlighthouse/mcp` | `createMcpServer` / `startStdioServer`: projects the command registry as MCP tools (Zod→JSON-schema), with progress-token streaming and `UnlighthouseError`→MCP error mapping. | Full |
| `cloudflare` | `@unlighthouse/cloudflare` | Reusable Workers adapters on explicit subpaths: Container audit transport, sitemap discovery, D1/R2 storage, rate-limit/container DOs, and the scan Workflow. The root export is storage-only. | Full |
| `lighthouse-container` | `@unlighthouse/lighthouse-container` | Generic OCI image + import-safe `./server` module for running real Lighthouse against an externally managed Chrome CDP endpoint. | Full |
| `github-action` | `@unlighthouse/github-action` | Composite Action wrapping `unlighthouse-ci`; posts `compare.markdown` to the PR. | — |

Deployment composition is not a package. `apps/cloudflare/` owns the maintained Worker runtime and entrypoint, Wrangler bindings and migrations, auditor tier policy, authentication and target policy, static assets, secrets contract, and deploy runbook. `packages/cloudflare/` contains only reusable Cloudflare adapters and runtime classes; it does not import from or own a deployable environment.

## Adapters per host

| Host | Crawler | Auditor | Rows | Blobs | Fan-out |
|---|---|---|---|---|---|
| Local CLI (`unlighthouse`) | `crawlee` | `local` (chrome-launcher + Puppeteer) | `drizzle` + `better-sqlite3` | `unstorage` + fs | WS broadcast |
| MCP (`unlighthouse-mcp`) | inherits CLI | inherits CLI | inherits CLI storage | inherits CLI storage | — (request/response + progress) |
| CF app (`apps/cloudflare`) | bounded Workflow discovery | PSI or Container Lighthouse, optional CrUX | shared `drizzle` repositories + D1 | `BlobStore` + R2 | polling; optional event adapter remains package-local |

The CLI's `resolveAuditor` also supports `psi`, `crux`, `dataforseo`, `cdp-connect`, `mock`, and router strategies via config.

## Cloudflare Workflows and Durable Objects

`packages/cloudflare/src/workflows/scan.ts` owns durable scan orchestration: stable indexed steps, bounded same-origin discovery, retryable audit RPC, progress persistence, and lifecycle rollback. The app pre-creates the D1 scan row, starts `ScanWorkflow`, and maps pause/resume/terminate onto native Workflow controls while mirroring status to D1. The former alarm-driven `ScanRunnerDO` is deleted.

`packages/cloudflare/src/do/` contains stateful platform adapters only: **`RateLimiterDO`** is a per-principal token bucket reached through typed RPC; **`LighthouseContainer`** is the `@cloudflare/containers` wrapper with idle sleep and shared lifecycle. **`ScanEventsDO`** remains an optional hibernating WebSocket fan-out adapter, but the maintained polling app does not bind it.

## UI

Nuxt SPA, three homes for a component (see `DESIGN.md` for the full rules):

1. **DS layer** — `packages/ui/layers/design-system/`: generic `Ui*` primitives, one-way mirror of `nuxtseo.com`. Read-only; domain UI here is wiped on resync.
2. **App-global** — `packages/ui/app/components/`: Unlighthouse-wide (`AppSidebar`, `QueryError`, `SidebarShell`). Auto-imported.
3. **Feature-local** — `packages/ui/app/features/{scan,sites,compare}/`: single-feature logic modules + colocated components, explicit imports. The old `dashboard` feature folded into `sites` (D-047).

**Page tree (post D-045..D-050 pivot, full rationale `packages/ui/ROADMAP.md`):** `/` is the only site list (sites-home, registry ∪ unregistered origins found in history); `/sites/[siteId]` is the site overview (trend charts, scan history table, compare launcher); `/sites/[siteId]/compare` is the compare workspace; `/sites/[siteId]/scans/[scanId]/{overview,routes,route/[path]}` plus `/sites/[siteId]/scans/[scanId]/packs/[pack]` for scan detail. Pack tabs are generated, not hand-built: the sidebar and the `packs/[pack]` page both read `pack.list`'s `ui: { tab, icon? }` metadata to build the tab strip, so a custom pack registered via `unlighthouse.config.ts`'s `packs` channel (D-046) appears automatically. Each tab renders through a shared `PackPageShell` with a bespoke widget per built-in pack and a generic findings/severity/raw-JSON renderer as the fallback for packs with no dedicated widget. Overview is the single scan landing regardless of status (D-049); live scan events live in a drawer opened from Overview rather than a separate `/events` page.

Data flow: `app/plugins/api.client.ts` provides `$api` — `createClient` from `@unlighthouse/contracts/client` on the live path, or `createStaticClient` from `@unlighthouse/core/api/static-client` for embedded snapshots (gated by `useIsStatic()`). `useApiQuery`/`useApiMutation` wrap `nuxt-use-query`, calling `api[command](input)`; a dev-only check validates each response against the command's output schema (parse, don't validate). The scan store (`app/stores/scan.ts`) feeds live `scan:*` WebSocket events into a progress reducer, with a polling fallback for no-WS deploys (Cloudflare). The dashboard is built via `nuxi generate` and embedded into the runtime by the CLI host (`unlighthouse/src/build.ts` `generateClient` → `server.ts` serves it with SPA fallback + `/api/**`).

## Key conventions

- **Errors as values** for expected domain failures; a single `UnlighthouseError` with a `.code` discriminant and a `category` (`fatal` / `route-failed` / `retryable` / `validation`). Codes include `NOT_SUPPORTED`, `ACTIVE_SCAN_CONFLICT`, `QUOTA_EXCEEDED`, `CONFIG_INVALID`, `SCAN_NOT_FOUND`, `ROUTE_NOT_FOUND`, `INPUT_INVALID`, `ASSERTION_FAILED`, `COMPARE_BASELINE_MISSING`, `SCAN_ALREADY_EXISTS`. Infra errors propagate.
- **No backwards compat with v0** — clean break, no shims. D-038 deleted the legacy `packages/client` / `packages/cli` bundles and the `// v0 re-export shim` files under `unlighthouse/src/process/*` + `src/cli/reporters/`; only `unlighthouse/src/types.ts` remains as a public re-export via `index.ts` (flagged, not a shim).
- **CLI is the third registry projection** — `unlighthouse/src/cli/` is generated from `contracts/commands` via citty (D-033), alongside the HTTP and MCP projectors; dot-names nest as subcommands (`scan.start` → `unlighthouse scan start`), flags derive from each command's Zod input, and `--agent`/non-TTY emits `$schema`-stamped NDJSON. The v0 ergonomic entry (`unlighthouse --site x.com`) survives as the root command. `ci.ts` keeps its own cac program (it is a CI runner, not a registry projection).
- **Treeshake invariants** — explicit subpaths keep heavy deps out of the wrong bundle (Crawlee and Node Lighthouse out of Workers, plus the `browser-static` scenario for the UI static path and `seeds-barrel` keeping `node:fs` out of the `./seeds` barrel — D-032/D-039). Enforced by `test/treeshake.test.ts`.
- **Reconciled-reader boundary (D-034)** — raw-LHR (`lhrBlobKey`) access is confined to the translation layer + dashboard export handler; `test/lhr-reader-boundary.test.ts` fails if any file outside {`report/extract`, `scan/route-audit`, `packs/reconcile-context`, `api/dashboard`, `build.ts`} gunzips a raw LHR blob.
- Runtime baseline: **Node ≥ 24.13.1** on every published package; **Lighthouse 13** is the pinned engine (`agentic-browsing` category + insight audits). Lighthouse's version is isolated in the report-translation layer (`core/report/*` + `auditors/lighthouse-report.ts`) and translated into our stable report shape.

## Where to start reading

- Engine factory + orchestration: `packages/core/src/core.ts`; reusable per-URL audit/finalize: `packages/core/src/scan/route-audit.ts`.
- CLI host wiring (default adapters, config, server): `packages/unlighthouse/src/host.ts` + `src/config/resolve.ts`.
- Add a command: `packages/contracts/src/commands/` (contract) → `packages/core/src/api/handlers/` (handler). It reaches CLI/HTTP/MCP/UI automatically.
- Add an adapter: pick the port dir under `packages/core/src/` (or `packages/cloudflare/src/`), implement the interface in `packages/contracts/src/ports/`.
- Full rationale + decisions log (D-001…D-051): `v1.md`.
