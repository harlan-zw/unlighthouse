# UI Roadmap — UX pivot

**Status:** approved 2026-07-02, in implementation. Traces `packages/ui` against [`VISION.md`](../../VISION.md), [`v1.md`](../../v1.md), and [`CONTEXT.md`](../../CONTEXT.md); continues the decisions log as D-045 to D-051. This recreates the `packages/ui/ROADMAP.md` that v1.md cites (the original was deleted); it is now the UI product-direction record.

## Why pivot

The pieces VISION promises all exist, but the UI carries two competing information architectures and the scan detail is organized around Lighthouse categories when the product's unit of output is the Pack:

1. Three overlapping top-level list surfaces (`/` dashboard, `/sites`, `/history`) all render sites and scans from the same `history.list`/`sites.list` data at different zoom; the site overview renders the history table a fourth time.
2. Scan tabs are hand-built category pages that stitch packs behind the scenes (performance = cwv + insights + images; best-practices = js-bundle + a raw N-request `route.audits` fan-out). The `Pack.ui` field is dead code; `pack.list` returns no ui metadata; a custom pack has no way to appear in the dashboard at all, contradicting "custom audit packs for the UI".
3. Three hand-maintained nav lists have already drifted: the sidebar omits `agentic-browsing`, the overview cards omit `crux`.
4. Compare is orphaned from the Site → Scan → Route spine: scan-scoped URL, own chrome, entered per-scan.
5. Live bugs found during the trace: `crux.vue` casts the pack output through a stale incompatible type (`CruxData` vs `CruxReportSchema`); the CLI opens `/sites/{siteId}/scan/{scanId}` (singular, no matching page); `.dashboard-theme` is applied nowhere, so the whole dashboard renders at the marketing elevation/type scale.

## Target IA

```
/                                → Sites home (the ONLY site list: registry ∪ unregistered origins found in history)
/scan/new                        → the one global action
/sites/[siteId]                  → Site overview: trend charts + THE scan history table + compare launcher
/sites/[siteId]/compare          → compare workspace (?current=&base=), full-bleed layout kept
/sites/[siteId]/scans/[scanId]/
   overview                      → single landing tab: summary, live progress, events drawer, exports
   routes                        → the one routes table (?sort= presets replace embedded copies)
   packs/[pack]                  → generated pack tabs (built-ins + custom), generic renderer + per-pack widgets
   route/[path]                  → route detail (unchanged; organizes by category from audit data)
```

Deleted: `/history`, `/sites` (management merges into `/`), `/compare/[id]`, `/scan/[id]` + `/scan/[id]/[...rest]` shims, the six category pages, `/events` as a page, dashboard KPI cards, in-scan sidebar route list.

---

## D-045 — Scan tabs are pack projections

**Decision.** One tab per pack, generated from `pack.list`. The sidebar scan section becomes: Overview, Routes, a PACKS group (CWV, Insights, Images, JS Bundle, Accessibility, SEO, Best Practices, CrUX, Agentic Browsing, plus any custom pack), Compare. The five category scores stay on Overview as scores (they are aggregates over audits, per CONTEXT.md), but tabs stop pretending categories and packs are the same taxonomy.

- `Pack.ui` is implemented as `{ tab: string, icon?: string }`. **`ui.component` is dropped from the contract**: the dashboard is a prebuilt SPA embedded by the CLI; loading third-party Vue components at runtime is unshippable without a component-loading machinery that has no precedent in the repo. The honest model is a generic renderer.
- `pack.list` output gains `ui` and `reportSchema` (via `z.toJSONSchema(pack.reportSchema)`), so the UI can build tabs and decode custom reports without hardcoded imports.
- `pack.run`'s `report` output schema widens to accept custom pack reports (built-in union stays exported for typed UI consumption by name).
- **A `best-practices` built-in pack ships** (reconciler clones the `seo-basics` pattern over reconciled reports, `categories['best-practices'].auditRefs`, `severityFromWeight`). This replaces the O(routes) client-side `route.audits` fan-out in `best-practices.vue` and is needed regardless of the tab work: it is currently the one category with no pack behind it.
- Generic renderer contract: severity-count badge row (5/9 built-ins already emit `severityCounts`), findings accordion for the `{ auditId|id, title, severity, routeCount, routes, fixHint }` convention (a11y, seo, agentic, insights, best-practices), adapters for resource-keyed findings (images, js-bundle), per-pack widgets for the bespoke shapes (CWV metric tiles, CrUX distribution, WebMCP blocks), raw-JSON fallback for unknown custom packs. Custom packs that follow the findings convention render well; ones that don't render degraded but visible. That tradeoff is explicit.
- `crux.vue`'s stale `CruxData` cast is fixed by rendering from the real `CruxReportSchema`; the dead type deletes with the page.
- Collapses the five independently hardcoded category lists (`AppSidebar.SCAN_MENUS`, `overview.ts CATEGORY_DEFS`, `route-detail.ts CATEGORY_LABELS`, `NewScanForm allCategories`, `sites/overview.ts SCORE_SERIES`) to: one generated tab source (pack.list) + one shared category-vocabulary module for the places that genuinely speak categories (route detail, scan form, trend series).

## D-046 — Custom packs get a config channel

**Decision.** `unlighthouse.config.ts` may export `packs: Pack[]` (it is a TS module; packs are code, not JSON). `resolve.ts` strips the key before Zod validation (config schemas stay `.default()`-free and JSON-shaped per D-011/D-020) and forwards it to `createUnlighthouseHost({ packs })`, which already exists (GAPS #3). Today the CLI never forwards packs, so `@unlighthouse-pack/*` is unreachable from the CLI; this closes that. With D-045, an installed custom pack then appears in the dashboard for free.

## D-047 — Sites home consolidation

**Decision.** `/` becomes the only site list; `/sites` and `/history` are deleted; the dashboard KPI cards (total scans, cross-site average score) are deleted (they answer no actionable question, per DESIGN.md "diagnose, don't display").

- Home rows = `sites.list` ∪ origins present in `history.list` but not registered, marked "unregistered". This preserves reachability of orphan scans (deleted sites keep their scans via `onDelete: 'set null'`; `scan.import` can reference unknown sites; the delete dialog explicitly promises "Scan history will be preserved").
- Row content: favicon, name/group, latest per-category scores, `UiStat` sparkline trend, last-scan time, health, Scan action. Add/edit/delete/group management (from `/sites`) moves into this page.
- The three `/history` fallback-redirect targets retarget to `/`. Client-side composition stays (realistic scan counts are small; `nuxt-use-query` dedupes the shared `history.list` fetch); no new command.
- Onboarding middleware unchanged (counts only).

## D-048 — Compare re-homed under the site

**Decision.** URL becomes `/sites/[siteId]/compare?current=&base=`. The full-bleed fixed-height workspace layout is kept (a split-pane diff earns full width, like a PR diff view); the top strip becomes a real breadcrumb back to the site. Embedding in `SidebarShell` was rejected: it needs a new no-scroll content mode (a layout-primitive change) and costs ~260px of diff width for little gain.

- `useCompareWorkflow`: `currentScanId` moves from route param to `?current=`; `swapDirection` becomes a query swap; `gotoOverview` and the route deep-link build canonical `/sites/{slug}/scans/...` paths instead of relying on shims.
- All six link sites rewrite: `sites/overview.ts compareLatest`, `workflow.ts swapDirection`, `AppSidebar` compare link, the `[...rest]` shim case, `gotoOverview`, the hardcoded route-detail NuxtLink in the compare page.
- Legacy `/scan/[id]` + `/scan/[id]/[...rest]` shims delete (repo convention: clean breaks; these are pre-pivot URLs). Old bookmarks 404 to the SPA home; accepted.
- The CLI's broken opened URL (`cli.ts`, `/sites/{id}/scan/{id}` singular) fixes to the canonical `/sites/{id}/scans/{id}` landing route, matching the UI's actual site-param format.

## D-049 — Overview is the single scan landing

**Decision.** Every scan link lands on `/overview` regardless of status. Kills three competing pieces of navigation logic: the `scan.status` probe in the landing redirect, `scanLinkPath`'s status branching, and Overview's own watcher that yanks the user to `/routes` when a live scan completes.

- Events demotes from a page to a drawer on Overview (`UDrawer`), reusing `useScanEventStream` verbatim (`events.tail` NDJSON is self-contained, mount per-open via `v-if` so the stream stops on close). The Events sidebar entry deletes.
- The in-scan sidebar route list (a second 500-row `scan.results` fetch, always live) deletes; Routes is one click away.
- The embedded route-score tables in `performance.vue`/`best-practices.vue` are replaced by deep links to `/routes?sort=score{Category}:asc` (the routes table already round-trips sort/filter state to the URL). INP joins the routes-table CWV columns so no capability is lost.
- JSON/CSV exports stay on the Overview header (they exist only there today; do not lose them in the reshuffle).

## D-050 — Naming pass (CONTEXT.md is the glossary)

Sidebar "Summary" → "Overview" (matches URL and page). "Scan Results"/"Live Scan" titles → "Overview". `ScanProgress`'s "Pages found" → "Routes found" (the one pages-vs-routes split; "routes" everywhere else). New-scan form keeps "pages" only where it describes crawling ("crawl all pages" is user-natural), results always say routes. "History" as a label retires with the page; per-site the table is "Scans".

## D-051 — Design-system alignment

What the restructure needs from the DS layer, classified. The layer is a one-way mirror of nuxtseo.com; nothing lands in `layers/design-system/` in-tree.

**Wire up what already exists (found hand-rolled duplicates):**
- `TrendChart.vue` re-platforms onto `UiChartFrame` + `useChartHover` + `useChartTickPlan` + `UiChartAnnotations` (release/CI markers are a textbook `ChartAnnotation` use; currently reimplemented ad-hoc).
- `ScanProgress` stat grids → `UiMetricsRow`/`UiStats`. WebMCP stat grid in agentic widgets → `UiStats`.
- Delta cells in `ScanRoutesTable` and compare → `UiTableTrendCell`/`UiTrend`.
- Severity chips: raw `UBadge` → `UiChip purpose="status"`/`UiStatusBadge` (PackFindings, compare, agentic, events).
- Quick-filter segmented buttons in `ScanRoutesTable` → `UiPillSelect`.
- `ScoreRing` composes `UiProgressCircle` instead of duplicating ring math.
- Compare's three hand-rolled `<table>`s → `UiTable`/`UiTableShell` (the "One table" decision already in DESIGN.md).
- Sites-home card trend → `UiStat` card variant.

**Build app-local (domain-specific, 2+ features → `app/components/`):**
- `DistributionBar` — one segmented threshold-band bar consolidating three independent implementations (MetricStatCard histogram, crux bars, overview distribution).
- `LogStream` — one terminal-ish stream consolidating `ScanTerminal` + the events list chrome.
- `CodeBlock` — mono + copy for selectors/snippets in findings (thin usage; app-local until proven).
- The pack tab strip / generic pack renderer (pack registry is app domain).

**Raw @nuxt/ui, sanctioned:** `UTabs` (device tabs, pack sub-nav), `UDrawer` (events), `UAccordion` (findings), `USwitch`, reka `Splitter*`.

**Upstream queue for the canonical DS (record in DESIGN.md, action at next resync):**
1. Existing debt: `UiTable`'s `#actions` slot, `rowClass(row)`, `defineExpose({ table })`.
2. Threshold-aware muted variant of `UiTableTrendCell` (compare's noise-threshold pattern).
3. `UiDistributionBar` (palettes already ship in `dataVizColors` with no component).
4. Labelled score-ring variant of `UiProgressCircle`.
5. Findings-accordion pattern (severity + count + expandable list), once stabilized here.
6. `UiDisclosure`: CSS contract exists in `global.css` with no component; flag upstream rather than duplicating.

**Doc fixes to DESIGN.md:** add `UAccordion`, `USwitch`, reka `Splitter*` to the "no wrapper yet" list; record that `.dashboard-theme` must wrap the app root (fixed in Phase 0; it was applied nowhere, so every card rendered at editorial elevation/type scale).

---

## Sequencing

One phase per commit (or small stack), each independently green (`pnpm typecheck`, `pnpm test`, UI `nuxi generate`).

| Phase | Work | Depends on |
|---|---|---|
| 0 | Mechanical cleanup + live bug fixes: delete `layouts/root.vue` dup (+ page metas), empty `app/components/{dashboard,site,category,scan}/` dirs, `img.png`, `true/`; apply `.dashboard-theme`; fix CLI opened URL; DESIGN.md doc fixes | — |
| 1 | Pack surface in contracts/core: best-practices pack, `Pack.ui` on all packs (+`core/packs/nuxt`), `ui.component` dropped, `pack.list` ui + JSON schema, `pack.run` report widening, config `packs` channel | — (parallel with 0) |
| 2 | Sites home consolidation (D-047): merge `/` + `/sites` + `/history`, orphan origins, nav, fallbacks | 0 |
| 3 | Compare re-home (D-048): URL + workflow params + six links + breadcrumb strip, delete shims | 2 (fallback targets) |
| 4 | Pack tabs (D-045 UI half): `/packs/[pack]` + generated sidebar + per-pack widgets, delete category pages, crux fix | 1, 3 (sidebar) |
| 5 | Scan detail consolidation (D-049, D-050): landing collapse, events drawer, sidebar route list, `/routes` presets + INP, naming | 4 |
| 6 | DS alignment (D-051): primitive wiring, DistributionBar/LogStream consolidation, upstream-queue notes | 4, 5 |

Non-goals for this pivot: no new commands (composition is client-side; `pack.list` changes are additive), no `ui.component`, no scan-tab customization config, no server-side site aggregates, no changes to route detail's category organization, nothing in `layers/design-system/` in-tree.
