# Unlighthouse architecture

Unlighthouse scans a whole website with Lighthouse, groups pages by template, merges the same problem found on many pages into one issue, and tracks every scan so two runs can be compared. A dashboard, a CLI, a CI gate and an MCP server for AI agents all sit on top of the same engine.

## Principles

1. **One package, one runtime.** Bun ≥ 1.4, TypeScript, ESM. No monorepo, no build step for the server. The dashboard is bundled by Bun's HTML imports when the server starts.
2. **Few dependencies, all audited.** Runtime: `lighthouse` (the audit engine, not rewritten), `puppeteer-core` (cookie/storage injection, login and rendered discovery on the same Chrome), `zod` (one schema for config, API, CLI and MCP), `react` + `react-dom` (dashboard, bundled). Everything else is Bun built-ins: `bun:sqlite`, `HTMLRewriter`, `Bun.serve` (HTTP + WebSocket), `Bun.spawn`, `Bun.gzipSync`, `node:util parseArgs`. Bun does not run dependency lifecycle scripts unless listed in `trustedDependencies`, which stays empty; the lockfile is committed and CI installs with `--frozen-lockfile`.
3. **One operation registry.** Every capability is an *operation*: a name, a description, a Zod input schema and a handler. The HTTP API, the MCP tools and the dashboard client are generated from that registry, so they cannot drift apart. The CLI calls the same handlers.
4. **Isolation where things crash.** Each Lighthouse run happens in its own child process with its own Chrome, a hard timeout and a process-tree kill. A hung page or a Chrome crash fails one page, never the scan.
5. **Honest numbers.** Performance scores are only meaningful under known conditions. Every page records its Lighthouse version, benchmark index, throttling mode, concurrency and sample spread; the dashboard flags results measured under conditions that make them unreliable instead of hiding the problem.
6. **Local first, safe by default.** All data lives in one directory (`.unlighthouse/`). The server binds to `127.0.0.1`, rejects foreign `Host`/`Origin` headers and requires a session token for every request.

## Domain

```
Site ──< Scan ──< Page (url × device) ──< Finding (audit × item)
```

- **Site**: an origin tracked over time (`https://example.com`).
- **Scan**: one run over a site with a frozen copy of its options: devices, categories, throttling, sampling, CI metadata (branch, commit), status and stats.
- **Page**: one URL measured on one device in one scan. Holds category scores (0–1, `null` = not measured), lab metrics (FCP, LCP, TBT, CLS, SI, TTFB), its *template* and provenance. Status: `queued → running → done | failed`, or `skipped` when sampling left it out.
- **Finding**: one failing audit on one page, optionally narrowed to one *item* (the image, script, DOM node or resource the audit names). Items are keyed by a stable string (resource URL, node selector).
- **Issue**: not stored; a `GROUP BY audit` over the findings of one scan. "Reduce unused JavaScript on 312 pages across 14 bundles" is one issue, so hashed bundle names that change on every deploy do not split it or make it look new. An issue counts its distinct items and carries the top few; items are the second level (`issues.get`). Issues are ranked by impact = affected pages weighted by severity plus estimated savings. Savings of the items on one page overlap, so each page contributes its largest item saving and those are summed over pages.
- **Template**: a URL pattern inferred from discovered paths (`/blog/*`, `/products/*/reviews`). Lets a summary say "the product template regressed" and lets sampling audit a few pages per template instead of thousands of copies.

## Pipeline

```
           ┌────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐
 options → │ discover   │ → │ templates +  │ → │ audit pool  │ → │ reconcile +  │ → SQLite + blobs
           │ robots     │   │ sampling     │   │ N workers,  │   │ findings     │
           │ sitemaps   │   │              │   │ 1 Chrome    │   │              │
           │ links      │   │              │   │ per audit   │   │              │
           └────────────┘   └──────────────┘   └─────────────┘   └──────────────┘
                         events (scan:*, page:*) → WebSocket, CLI progress, MCP polling
```

1. **Discover** (`src/discover`). `robots.txt` (groups, wildcards, `$`, crawl-delay, sitemap lines), sitemaps (indexes, gzip, limits), and a breadth-first link crawl over plain HTTP using `HTMLRewriter`. Same origin only, fragments dropped, tracking parameters stripped, non-HTML extensions and non-`text/html` responses skipped, redirects followed and recorded. For client-rendered sites `discover.render` loads pages in headless Chrome before reading links. An explicit `urls` list skips discovery entirely (hash routes, private pages).
2. **Templates and sampling** (`src/discover/templates.ts`). Paths become a trie; a node whose children are many and look alike (ids, slugs, dates) collapses into `*`. `sampling.perTemplate` (default 5) picks pages per template; the rest are listed as `skipped` so the dashboard still shows the full site map.
3. **Audit** (`src/audit`). A pool of `concurrency` workers. A worker spawns `bun src/audit/worker.ts`, which launches Chrome, applies auth (headers, cookies, storage), runs Lighthouse with the device config and returns the result over stdout. `samples > 1` runs a page several times and keeps Lighthouse's own median run; the spread is stored. Retries on Chrome/protocol errors, not on page errors.
4. **Reconcile** (`src/audit/reconcile.ts`). The only module that reads raw Lighthouse output. Produces the page row and its findings. The raw report is gzipped into `blobs/` for the full Lighthouse HTML viewer and for later re-reconciling.
5. **Field data** (`src/field/crux.ts`, when `crux.enabled`). After auditing, the Chrome UX Report API is queried per audited page and form factor (PHONE ↔ mobile, DESKTOP ↔ desktop) with origin fallback; with `crux.history` the History API adds a weekly origin trend. Answers (including "no data") are cached in SQLite for 24 h, 429 backs off and then stops querying, and any CrUX failure is logged, never failing the scan. The key comes from the environment variable named by `crux.apiKeyEnv` (default `CRUX_API_KEY`) and is never stored. The summary shows field p75 next to lab p75 with a note that they measure different things; `budgets.field` can gate on origin field p75.
6. **Analyse** (`src/analysis`). Summary, issue ranking, comparison between two scans (pages and issues: new, fixed, regressed, improved, with a noise threshold) and budget checks.

## Authentication

`auth.headers`, `auth.cookies` and `auth.storage` (localStorage/sessionStorage) are injected into every audit before navigation. `auth.login` points at a script that receives a Puppeteer `page`; Unlighthouse runs it once at scan start, captures the resulting cookies and storage and reuses them for every audit, so a login form runs once instead of once per page.

## Operations

| Operation | Kind | Purpose |
|---|---|---|
| `sites.list` | read | Tracked sites with their latest scan |
| `scans.list` | read | Scans, newest first, filterable by site |
| `scans.start` | write | Queue a scan; returns its id |
| `scans.get` | read | Status, progress and stats |
| `scans.cancel` | write | Stop a running or queued scan |
| `scans.delete` | write | Remove a scan and its blobs |
| `scans.summary` | read | Small, agent-sized overview: scores per device, worst templates, top issues, change since baseline |
| `scans.field` | read | CrUX field data: origin p75 and histograms per device, per-page URL/origin coverage |
| `pages.list` | read | Paged, sortable, filterable page table |
| `pages.get` | read | One page: scores, metrics, provenance, findings |
| `pages.rescan` | write | Re-audit one page in place |
| `issues.list` | read | Site-wide issues ranked by impact |
| `issues.get` | read | One issue with its items and every affected page |
| `compare` | read | Diff two scans |
| `budgets.check` | read | Evaluate budgets against a scan (and its baseline) |
| `flows.list` | read | User flow runs of a scan with their steps ([flows](flows.md)) |
| `flows.get` | read | One flow run with the findings of every step |

Transport rules: HTTP is `POST /api/<operation>` with a JSON body; MCP exposes each operation as a tool with its JSON Schema from `z.toJSONSchema`; the WebSocket at `/ws` streams scan events. Errors are values with a stable `code` (`NOT_FOUND`, `INVALID_INPUT`, `SCAN_ACTIVE`, …).

## Storage

`.unlighthouse/unlighthouse.db` (SQLite, WAL) holds sites, scans, pages and findings; `.unlighthouse/blobs/<scan>/<hash>-<device>.json.gz` holds raw Lighthouse reports and `<hash>-<device>.webp` page thumbnails (from the median run's final screenshot, converted with `Bun.Image`). Schema changes are numbered migrations in `src/db/migrations.ts`, applied on open. `unlighthouse prune --keep N` drops old scans per site.

## Hosts

- **CLI** (`unlighthouse`): `scan <url>`, `serve`, `ci <url>`, `compare <a> <b>`, `export <scan>`, `mcp`, `prune`. Config from `unlighthouse.config.ts` (typed with `defineConfig`), flags override it.
- **Dashboard** (`unlighthouse serve`): sites, live scan progress, overview, pages table, issues, page detail with the full Lighthouse report, compare.
- **CI** (`unlighthouse ci`): scans, finds the baseline (latest finished scan of the same site and devices, preferring the base branch), checks budgets, writes Markdown (also to `$GITHUB_STEP_SUMMARY`) and JSON, exits non-zero on failure.
- **MCP** (`unlighthouse mcp`): stdio JSON-RPC server implemented in-repo (no SDK dependency). Agents start at `scans.summary` and drill down.
- **Static export** (`unlighthouse export`): a self-contained folder with the dashboard and a data snapshot, readable without a server. `--format csv` writes `pages.csv` and `issues.csv` instead (columns in `docs/export.md`); the server serves them at `GET /export/<scanId>/pages.csv` and `issues.csv`.

## Layout

```
src/
  cli.ts                 entry point
  config.ts              schema, defaults, config file loading
  errors.ts              UnlighthouseError + codes
  events.ts              typed event bus
  db/                    open, migrations, queries
  discover/              robots, sitemap, links, urls, templates, crawl
  audit/                 pool, worker (child process), lighthouse config, reconcile, auth
  scan/                  scan runner and queue
  analysis/              summary, issues, compare, budgets, markdown
  ops/                   operation registry and handlers
  server/                Bun.serve app, security, static export
  mcp/                   stdio MCP server
  ui/                    React dashboard
test/                    bun test
```
