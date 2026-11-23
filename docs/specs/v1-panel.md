# v1 panel

The dashboard is the marketing prop for "agentic-first Lighthouse scans of a whole site". It shows one thing well: a whole site was scanned and thousands of findings became a short list of issues. Reports are what users generate through the agent primitives (CLI, MCP), so the panel stays an issue list.

Design: https://claude.ai/artifact/JLfvPAfs1XuAUHFmrpXjRK. The artboard sources are in `docs/specs/v1-panel/*.dc.html` (static HTML plus a small `renderVals()` script with sample data). They define layout, copy and tokens; sample numbers are not real.

## Decisions

- No new dependencies. No shadcn, Tailwind or Radix. Plain React + `src/ui/styles.css`.
- Dark is the reference look. The dark tokens in `styles.css` change to the design palette below; the light theme stays and gets matching values. The theme toggle stays.
- All five categories weigh the same. Performance is always labelled `lab` (tooltip: "Lab score, measured locally under parallel load"); the scan's reliability warnings go into that tooltip.
- No explanatory sentences in the UI. A heading, a number, a label. If the design has no text there, the build has none.
- Removed from the panel (still available through MCP/CLI): the scan Overview tab (field data, site checks), the issue "First seen" and "Trend" rows (not stored).

## Palette (dark)

| token | value |
|---|---|
| `--bg` | `#0E0F12` |
| `--surface` (sidebar, card headers) | `#121317` |
| `--surface-2` (controls) | `#17181C` |
| `--surface-3` (active nav, selected) | `#1E2026` |
| `--border` | `#23252B` |
| `--border-row` | `#1C1E23` |
| `--border-strong` | `#2A2C33` |
| `--text` | `#E6E7EA` |
| `--text-2` | `#C3C6CD` |
| `--text-muted` | `#9BA0AA` |
| `--text-faint` | `#7D828C` |
| `--accent` | `#8B93FF` (fg on accent `#0E0F12`) |
| good / average / poor score | `#4CC38A` / `#E5B64A` / `#F2785C` |
| new / regressed | `#F2A766` |
| fixed | `#7FD3A6` |
| severity high / medium / low | `#F2994A` / `#D9B44A` / `#8B93FF` (three-bar icon, Main.dc.html) |

Inter for text, JetBrains Mono (falls back to `--font-mono`) for URLs, templates, selectors and commands. Base size 13px, rows 44–48px, radius 6/8/10px.

## Shell

`Main.dc.html` sidebar, used by every screen except Home's variant:

- Brand (keep the existing mark), site + scan switcher (site host, `Scan #<n> · <time>` or `running`; opens a list of the site's scans).
- Scan-level nav: Issues (count), Pages (count), Templates (count), Links (only when the scan has broken links). Site-level nav: Scans, Compare. A dot on Scans while a scan of this site runs.
- Bottom box: "Agent access" + `unlighthouse mcp`.
- Header bar: breadcrumb (site / section / item), status pill, actions. Theme toggle and the mock/static pill move into the header's right side.
- Sidebar stacks above content below ~720px (flex-wrap, as in the design).

Home (`Home.dc.html`): same sidebar with Home, Scans and the list of sites instead of scan-level nav.

## Routes

| route | screen | design |
|---|---|---|
| `/` | Home: new scan form + sites list | Home.dc.html |
| `/sites/:id` | Scans of a site (list, newest first, status, issue count, new/fixed vs previous) | sidebar "Scans"; rows as Home's site rows |
| `/scans/:id` | running → Live scan; finished → Issues | Scan.dc.html / Main.dc.html |
| `/scans/:id/issues/:auditId` | Issue detail | Issue.dc.html |
| `/scans/:id/templates` | Templates | Templates.dc.html |
| `/scans/:id/pages` | Pages (existing table, restyled) | — |
| `/scans/:id/links` | Broken links (existing, restyled) | — |
| `/scans/:id/page?url&device` | Page detail (existing, restyled into the shell) | — |
| `/compare?site&base&head` | Compare | Compare.dc.html |

Old `/scans/:id/issues` and `/scans/:id/overview` links redirect to `/scans/:id`.

## Screens

**Home.** "Scan a whole site", URL input, Scan button (calls `scans.start`, navigates to `/scans/:id`), toggles for Mobile, Desktop, sampling ("5 pages per template", from config default) and "Requires login" (disabled with a tooltip pointing at `auth` config when no auth is configured). Sites list from `sites.list`: letter tile, host, `<pages> pages · <templates> templates`, issue count, `+N new · M fixed` vs the previous scan, or a progress bar while running, last scan time.

**Issues (scan home).** Title `<n> issues`, sub line `<findings> findings · <pages> pages · <templates> templates`, right side `+N new · M fixed since #<prev>` linking to Compare. Five equal category tiles (median score, `<n> issues`, `lab` tag on Performance); clicking a tile filters the list, again clears it. Filter chips: category, template, device. Sort control "Impact ↓". Rows: severity icon, title, item summary, `new` tag when not in the baseline, first template (or "all templates"), category pill, `<n> pages`. Row → issue detail.

**Issue detail.** Title, one line `<pages> of <total> pages · <items> elements · <templates> templates`. Elements table (selector/label, comes-from template, pages). Templates cards (pattern, pages, bar, example URL). Side panel: Category, Severity, Devices, Audit id, an `issues.get` call block (Copy for agent copies it), link to a page's full Lighthouse report. Actions: Copy for agent, Export CSV (existing `issues.csv` export).

**Templates.** Title `<n> templates`, sub `<pages> pages · <k> audited per template`. Table: template, pages, five median scores (Perf with `lab`), top issue (link). Expanding a row lists its audited pages (`pages.list` with `template`, limit 10) with their failing-audit count; a page links to page detail.

**Live scan.** Shown while the scan is queued/discovering/auditing. Steps Discover / Audit / Merge with progress lines. Counters: pages, templates, audits (`done` of `queued + done`), findings → issues (findings count up from `page:status` events; on `scan:status done` the number animates to `issueCount` from `scans.summary`). Templates box: patterns appear from `page:discovered`, page count per template, five dots per template filling with audited pages. Activity feed: last ~9 events, newest first (`found`, `audit <url> · <device>`, `failed`, `done`). When done: top 4 issues and "All <n> issues". Restart = `scans.start` with the same options.

**Compare.** Header: base and head pickers (`#<n> · <branch> · <short commit>`). Title `<base issues> → <head issues> issues`, sub `N new · N regressed · N fixed · N unchanged`. Budget chip from `budgets.check` (failed: first failing budget; passed: "Budgets passed"; hidden when no budgets). Five category tiles with head median and delta; deltas under the noise threshold show `±x noise`. Tabs New / Regressed / Fixed: regressed = persisting with `pagesDelta > 0`. Rows: title, category, `basePages → headPages`.

**Agent.** No route. The sidebar box and the Copy-for-agent blocks are the agent surface.

## Backend changes (step 1)

1. `scans.templates` rows gain `audited: number` (done pages), `scores: Scores` (median per category over done pages, all devices; `null` when none) and `topIssue: { auditId, title, pages } | null` (highest-impact issue whose findings include that template).
2. `ScanSummary` gains `findingCount: number` (failing findings of the scan).
3. The `page:status` event with `status: 'done'` gains `findings: number` (failing findings of that page). Both emit sites in `src/scan/runner.ts`.
4. Types in `src/types.ts` / `src/events.ts`, MCP schemas follow automatically from the registry. Tests in `test/ops.test.ts` and `test/scan.test.ts`.

## UI work (step 2)

- New shell in `App.tsx` + `components/layout.tsx`; router changes in `router.tsx`.
- New screens: `Home.tsx` (replaces `Sites.tsx`), `Issues.tsx` (replaces `ScanIssues.tsx` + `ScanOverview.tsx`), `IssueDetail.tsx`, `Templates.tsx`, `LiveScan.tsx`; `Site.tsx`, `Compare.tsx`, `ScanPages.tsx`, `ScanLinks.tsx`, `PageDetail.tsx` restyled.
- `mock.ts` produces the new fields; `test/ui-mock.test.ts` schemas follow.
- Static export (`static.ts`, `static-main.tsx`) keeps working with hash routing.

## Done when

- `bun run check` passes.
- `bun src/cli.ts serve` with `?mock` shows every screen above; a real scan of the local fixture shows the live scan and lands on Issues.
- Narrow window (390px): sidebar stacks, tables scroll in their box, no horizontal page scroll.
