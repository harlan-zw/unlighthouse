# Unlighthouse UI — Design System

Canonical patterns for the Unlighthouse dashboard. Components enforce most rules automatically; use the right component and the rule follows. This doc covers what components don't enforce and how to compose them.

These rules implement Unlighthouse's design principle: **minimal, professional, editorial — data legibility over visual theatrics.** Chrome stays monochrome and quiet so audit scores, severity, and metric identity do the talking. When a design choice trades clarity for polish, clarity wins.

---

## Voice & Copy

UI strings, empty states, error messages and tooltips read like CLI output, not marketing copy. Opinionated, terminal-shaped, assumes the reader runs Lighthouse audits and edits code.

| Don't | Do |
|-------|-----|
| "Optimize your site's performance" | "12 routes scoring below 50 on performance" |
| "Configure scan settings" | "Set throttling, device, and route discovery" |
| "Welcome! Let's get started" | "Connect a site to run your first audit" |
| "There was an error" | "Scan failed: connection refused on `:3000`. Check the server is running and retry." |
| "Good job!" | "92 — passing" |

**Rules:**
- Lead with the noun and the number. State what is, not what could be.
- File paths, route names, status codes, exact counts > adjectives.
- Empty state titles sell the value of the feature, not the absence of data ("Run a scan to surface render-blocking resources" > "No scans yet").
- "View report" is canonical for opening a scan result. No "Learn more", "Get started", "Discover", "Unlock".
- Error strings name the failure and the next action in one sentence.
- Button labels are `verb + object`: `Run scan`, `Export results`, `View report`. Never `OK`, `Submit`, or bare verbs.
- Score copy pairs number with status: `92 — passing` not `Good`.
- Severity labels: `critical / serious / moderate / minor / info` — match audit conventions, don't soften.

---

## Diagnose, don't display

Every score, hero metric and audit row earns its place by answering **"so what?"** in a way the user can act on without leaving the page.

- Hero scores (`Summary`, `CellScoreSingle`) ship with a status word (`passing / needs work / poor`) or a delta vs the prior scan. A naked number is a vanity tile and fails review.
- CrUX metric cards (`CruxMetricCard`) ship with three things by default: latest value, trend percentage, and the P75 distribution bar. A bare value is incomplete.
- Issue rows (`IssueRow`) include `severity`, affected page count, and an expandable list of pages. A row without affordance is a stat, not a diagnosis.
- Tables that show audit results include the action: "View page", "Open in DevTools", "Copy selector". If the user has to take a value to ChatGPT to understand it, the view failed.

---

## Multi-scan by default

Views default to a frame that works for a user with months of scan history, not one. Single-scan framing is the exception and gets justified per-page.

- Scan history (`/`) is the canonical landing. Per-scan detail lives under `/results/[scanId]/*` and is reached *through* the index.
- Site grouping (`groupBy: 'site'`) is the default on the index view — most users audit the same domain repeatedly.
- The header includes site, device, throttle, and routes-scanned context. Never duplicate this in the page body.
- Settings and config live elsewhere; the dashboard is read-only over the scan record.

---

## Colors

### Mode

Dark only. `colorMode.preference: 'dark'`, `ssr: false`. No `light:` variants — stripping them is mandatory; light-mode class pairs are dead code and a known review hard reject.

### Identity: Stone

**Stone serves as both primary and neutral.** One warm-gray scale drives the whole interface; saturated brand color is intentionally absent from chrome. The interface reads editorial and professional — closer to Stripe / Notion than to a colorful SaaS dashboard.

```ts
// app.config.ts
ui: { colors: { primary: 'stone', neutral: 'stone', ... } }
```

- **Primary CTAs** resolve to near-white over the warm-dark base (`bg-stone-100`–`bg-stone-200` text on `bg-stone-900` page) — the "lit from above" Vercel / Linear pattern. The CTA reads as a typographic moment, not a colored splash.
- **Active nav, selected rows, hovered links** use `text-highlighted` and `bg-elevated`, never a saturated tint.
- **Logo is monochrome.** No gradient tile, no cyan / blue split.

### Semantic Tokens (never hardcode hex)

**Text:** `text-default`, `text-muted` (secondary), `text-dimmed` (tertiary), `text-highlighted` (active), `text-toned` (nav labels)

**Backgrounds:** `bg-default` (page), `bg-elevated` (cards), `bg-muted` (pills), `bg-accented` (hover)

**Borders:** `border-default`, `border-accented` (active)

**Inverted:** `bg-inverted`, `text-inverted` — used for primary CTAs (auto-flips to the bright end of the scale in dark mode).

> Prefer Nuxt UI shorthands. Use `[var(--ui-*)]` only for opacity modifiers. Every `--ui-*` resolves from the stone scale in `:root, .dark` (see `assets/css/main.css`).

### Status Colors (`utils/index.ts`)

Status colors are the **only** saturated colors in chrome. They earn their saturation because they encode information.

Use `semanticColors`, `thresholdToSemantic(value, good, poor)`, `thresholdHex(...)`. Never hardcode `text-green-*`, `text-red-*` for status.

```ts
semanticColors.success // { dot: 'bg-green-500', text: 'text-success', hex: '#22c55e' }
thresholdToSemantic(2400, 2500, 4000) // 'success' (LCP good)
```

Lighthouse score thresholds: `>= 90` success, `>= 50` warning, `< 50` error. Encoded in `getScoreColor()` / `getScoreBg()` (`composables/dashboard.ts`).

### Metric Identity Colors (`utils/index.ts`)

CrUX metric identity uses a fixed palette so charts stay recognisable across pages. These are the **only** decorative-feeling colors permitted, and they encode metric identity:

| Metric | Hex | Why |
|--------|-----|-----|
| `cwvMetricColors.lcp` | `#6366f1` (indigo) | Load |
| `cwvMetricColors.inp` | `#0ea5e9` (sky) | Interactivity |
| `cwvMetricColors.cls` | `#a855f7` (purple) | Stability |

Color must encode information. Don't repurpose CWV colors for unrelated UI. Don't add metric colors without registering them in `utils/index.ts`. If a chart series doesn't carry meaning, it uses neutral `text-dimmed` / `--ui-text-dimmed`.

### Color Budget

Mental check before adding any non-neutral color:
- Does it encode a status? (success / warning / error) → semantic color, OK
- Does it identify a metric? (LCP / INP / CLS) → CWV identity, OK
- Is it decoration? → use neutral; don't ship it

---

## Typography

| Token | Font | Usage |
|-------|------|-------|
| `--font-sans` | Satoshi | Body, UI, headings (heavier weight, not a separate display font) |
| `--font-mono` | JetBrains Mono | URLs, route paths, response codes, raw audit output |

**Manual:** Body `text-sm`, dense body `text-[13px] text-muted`, badge text `text-xs`. Use `.nums-tabular` (or `tabular-nums`) on all columnar numbers — scores, durations, byte counts, percentages.

Avoid the top-5 web fonts (Inter, Roboto, Open Sans, Lato, Montserrat, `system-ui`). Satoshi's geometric character reads engineered and editorial against the warm stone neutrals; JetBrains Mono pairs visually.

Type scale is rem-fixed. This is application UI, not marketing. Avoid `clamp()` and fluid scales in table/dashboard text.

With chrome stripped of saturation, typography carries more weight: lean on size, weight, and tracking to build hierarchy that color used to provide.

---

## Icons

- **Heroicons** (`i-heroicons-*`): primary system chrome, navigation, status
- **Lucide** (`i-lucide-*`): gaps heroicons lack (charting glyphs, `chevrons-left-right`, etc.)

Sizes: empty state `size-6`–`size-8`, nav `size-5`, inline/buttons `size-3.5`–`size-4`, dots `size-1.5`–`size-2.5`. Max `size-8`.

### Icon Color Rule

Only use colored icons when the color encodes status or metric identity (via `semanticColors` or `cwvMetricColors`). Decorative and navigational icons must use `text-current` and inherit from a neutral container — `text-dimmed` or `text-muted`. Never assign arbitrary colors to icons.

| Context | Treatment |
|---------|-----------|
| Status (success, warning, error) | `semanticColors[status].text` |
| CWV metric identity (LCP, INP, CLS) | `cwvMetricColors.<key>.hex` for charts |
| Navigation, section labels, list headers | `text-dimmed` / `text-muted` monochrome |
| Severity badge icon | Inherits from `SeverityBadge` color slot |

### Single Signal Per Row

Encode severity/status **once** per row, not twice. If the row's icon already carries semantic color, don't also stack a `SeverityBadge` next to it. The count/value on the right may repeat semantic color since it's a different visual slot (quantity, not identity).

---

## Layout

### Shell & Page Structure

`DashboardShell` provides the sidebar + mobile drawer + logo + footer scaffold. Pages use `layout: 'dashboard'` to opt in. Headers (page title, breadcrumb, scan context) live in `DashboardHeader` at the top of each page body.

**Sidebar:** fixed left, `w-56` or `w-64`, collapses to drawer below `lg`. Site/scan history (`SidebarHistory`) sits at the top of the sidebar — the canonical scan-context surface, never duplicate scan info in the page header.

### Surfaces

Flat tinted surfaces. **No backdrop blur, no glass, no mesh, no gradient backgrounds.** Hierarchy comes from the tier ladder:

- Page: `bg-default` (`--ui-bg`)
- Card / panel: `bg-elevated/40` or `bg-elevated`
- Pill / badge: `bg-muted`
- Hover / active row: `bg-accented` or `bg-elevated/60`

Borders sit at `border-default` and shift to `border-accented` on active. Cards use a single hairline border, never a drop shadow. The only shadows permitted are `shadow-sm` on overlays (popovers, tooltips, modals) where the surface needs to read as floating.

### Page Anatomy

Every data page follows this vertical order:

1. `DashboardHeader` (title, scan meta, refresh)
2. Alert zone (`PageError` / setup nudges — stack by severity)
3. **Primary** — hero summary (`Summary` score block) or CrUX cards
4. **Secondary** — supporting grids (issue lists, tables)
5. **Tertiary** — detail tables, expandable rows

Spacing between tiers: `mt-8` (primary), `mt-10` (secondary/tertiary). Inside a tier: `gap-4` to `gap-6`.

### Grid Layouts

Inside a tier, pick one of:
- **`equal`**: 2-col at `lg`, stacks below
- **`wide-narrow`**: 3-col with first child auto-spanning 2 cols (chart + side panel)
- **`stack`**: full-width vertical (tables, long lists)

One layout per tier. Don't mix grid patterns inside a single section.

### Hero Zone Rules

One hero moment per page. Pick exactly one:
- `Summary` (avg score + stat row) — for the scan overview page
- Three `CruxMetricCard` (LCP/INP/CLS row) — for performance
- Filter bar + scan list — for the index

Never mix two hero patterns. Primary charts sit borderless below the hero, never inside their own bordered card on top of it.

### Page Density Modes

| Mode | Layout |
|------|--------|
| **Data-rich** | Tight gaps (`gap-2`–`gap-3`), compact cards (`p-3`–`p-4`), paginated tables |
| **Onboarding** | Centered hero (`py-12`+), single CTA, sparse cards |
| **Scan-in-progress** | Live progress as hero, status feed as secondary |

When a scan has no completed audits yet, the progress feed IS the hero. Score blocks render as skeletons until data arrives.

---

## Page Composition Blueprints

| Page | Hero (Primary) | Secondary | Tertiary |
|------|---------------|-----------|----------|
| **Scan History** (`/`) | Filter bar + sort + grouping toggle | Grouped scan rows | Empty state when filtered to nothing |
| **Scan Overview** (`/results/[scanId]`) | `Summary` (avg score + stat row) | 4-up category cards (Perf / A11y / Best / SEO) | Recent issues list |
| **Performance** (`/results/[scanId]/performance`) | 3-col `CruxMetricCard` row (LCP/INP/CLS) | Tabs: Web Vitals / Images / Third-Party / LCP Elements / Routes | Per-tab tables |
| **Accessibility** (`/results/[scanId]/accessibility`) | Severity-grouped issue counts | `IssueRow` list (expandable, paginated) | Missing-alt image grid, contrast cell elements |
| **Best Practices** (`/results/[scanId]/best-practices`) | Severity-grouped issue counts | Vulnerable libraries, deprecated APIs, console errors | Library inventory |
| **SEO** (`/results/[scanId]/seo`) | Meta coverage stats | Duplicates, canonical chains, link-text issues | Per-route meta table + social preview cards |
| **Scan in progress** (`/results/[scanId]/scan`) | Progress bar + route counter | Status feed | — |
| **Onboarding** (`/onboarding`) | Empty hero (`py-12`+, single CTA) | — | — |

---

## Components (Quick Reference)

### Layout
| Component | Purpose |
|-----------|---------|
| `DashboardShell` | Sidebar + drawer + logo + footer scaffold |
| `DashboardHeader` | Page title row with scan context |
| `NavBar` / `NavList` | Top-level nav inside `DashboardShell` |

### Cards & Metrics
| Component | Purpose |
|-----------|---------|
| `DashboardCard` | Generic titled card with header + count badge + loading skeleton slot |
| `Summary` | Avg score + horizontal stat row (overview hero) |
| `StatItem` | Single label/value pair with semantic variant (`success/warning/error`) |
| `CruxMetricCard` | CrUX metric tile — value + trend + P75 distribution + chart |
| `CruxMetricChart` | Sparkline/area chart for a single CrUX series |
| `CellScoreSingle` | Score-pill cell with `getScoreColor`/`getScoreBg` |
| `CellScoresOverview` | Multi-category score row (Perf/A11y/Best/SEO) |

### Audit & Issues
| Component | Purpose |
|-----------|---------|
| `IssueRow` | Expandable issue row with severity badge + page count + page list |
| `PagesList` | Bulleted list of affected pages with route links |
| `AuditResult` | Lighthouse audit detail block |
| `AuditResultItemsLength` | Compact items count for an audit |
| `SeverityBadge` | Severity pill — collapses `critical+serious → error`, `moderate → warning`, `minor+info → info` |

### Cells (table cell renderers)
| Component | Purpose |
|-----------|---------|
| `CellRouteName` | Route path with mono font + truncation |
| `CellImage` / `CellImageOutline` / `CellImageIssues` | Image-audit cell variants |
| `CellLargestContentfulPaint` / `CellLayoutShift` / `CellWebVitals` | Web vital cells with threshold coloring |
| `CellNetworkRequests` | Request count + transfer size |
| `CellMetaDescription` | SEO meta cell with length validation |
| `CellTapTargets` | Touch-target audit cell |
| `CellIndexable` | Boolean indexability indicator |
| `CellColorContrast` | A11y contrast cell with fg/bg swatches |
| `CellScreenshotThumbnails` | Screenshot thumbnail strip with modal trigger |

### Results
| Component | Purpose |
|-----------|---------|
| `ResultsRoute` | Single route's full result panel |
| `ResultsCell` | Generic results cell wrapper |
| `ResultsTableHead` | Table header with sort affordance |

### Status Indicators
| Context | Component |
|---------|-----------|
| Severity pill | `SeverityBadge` |
| Score pill | `CellScoreSingle` (scope: tables/lists) |
| Scan run status | `LoadingStatusIcon` |
| Dynamic sampling notice | `DynamicSamplingMessage` |

### Feedback & Alerts
| Component | Purpose |
|-----------|---------|
| `PageError` | Full-page error state with retry CTA |
| `ErrorBoundary` | Catches render errors in a section, falls back to inline error |
| `ModalThumbnails` | Modal viewer for screenshot strips |
| `Tooltip` | Wrapper around `UTooltip` (prefer `UTooltip` directly) |

### Loading
Always `USkeleton` with staggered widths. Never spinners.
| Component | Purpose |
|-----------|---------|
| `LoadingStatusIcon` | Per-route scan status indicator (queued / running / done / failed) |
| `SkeletonCard` | Full-card placeholder |
| `SkeletonScanCard` | Scan list card placeholder |

### Decorative
| Component | Purpose |
|-----------|---------|
| `LighthouseThreeD` | Hero illustration (onboarding only) — render in monochrome stone tones, not the old colored gradient |

### Tabs

Three patterns, each with a distinct **intent** and a distinct **active treatment**. Pick by what the tab navigates, not by look.

| Pattern | Intent | Component / variant | Active treatment | Example |
|---------|--------|---------------------|------------------|---------|
| **Section view-mode toggle** | Non-routing, in-page state switch | `UTabs variant="pill"` | `bg-elevated` pill (quiet, monochrome) | `performance.vue` Web Vitals / Images / Third-Party / Routes |
| **Form-factor toggle** | Switch dataset (phone ↔ desktop CrUX) | Inline `UButton` pair or `UTabs variant="pill" size="xs"` | Pill indicator | `performance.vue` phone/desktop CrUX |
| **Route-based tabs** | Routes between sibling pages (not currently used) | Reserved: `UTabs variant="link"` | White underline + `text-highlighted` | — |

**Rules:**
- No icons on view-mode toggles. Labels only.
- Tab indicator stays monochrome — `bg-elevated` or `text-highlighted` underline, never a saturated brand tint.
- View-mode toggle owns its own spacing via the host (section header action slot, toolbar).

### Tables

Header row uses `bg-elevated`; body rows separated by `border-b border-default`. No zebra striping — it competes with severity row highlighting. Cell renderers come from `components/Cell/`. Use `ResultsTableHead` for sort-aware headers.

50+ rows must paginate (default 25). Numeric columns right-aligned, tabular-nums.

---

## Data Visualization

| Context | Min height |
|---------|-----------|
| Primary CrUX chart (`CruxMetricChart`) | `h-[140px]` |
| Distribution bar (P75) | `h-4` |

**Line styling:** primary series 2–3px stroke + area gradient fill at low opacity. Comparison/secondary: 1px dashed or `opacity-50`. Colors come from `cwvMetricColors`.

**Sparkline colors:** metric identity or neutral (`text-dimmed`). No arbitrary colors without legends.

**Distribution bars:** three-segment good/NI/poor with `bg-success/75`, `bg-warning/75`, `bg-error/75` and inline percentage labels when segment ≥ 15% width.

---

## Spacing

4pt base grid: 1 (4px), 2 (8px), 3 (12px), 4 (16px), 6 (24px), 8 (32px), 12 (48px), 16 (64px). Avoid `5`, `7`, `9`, `10`, `11` — they break rhythm.

| Gap | Usage |
|-----|-------|
| `gap-1`–`gap-1.5` | Tightly coupled (dot + value, icon + label) |
| `gap-2`–`gap-3` | Related items in a row or list |
| `gap-4`–`gap-6` | Between sections in a card |

| Padding | Usage |
|---------|-------|
| `px-2.5 py-1` / `p-1.5` | List items, small buttons, badges |
| `px-3 py-2` / `px-4 py-3` | Card headers, dense row hosts |
| `p-4` | Card body (data-rich default) |
| `p-6` / `px-6 py-4` | Card body (overview / hero) |
| `py-12`+ | Landing / onboarding only |

Reserve generous spacing for marketing-shaped pages. Dashboards use the compact end.

---

## Motion

| Context | Duration | Easing |
|---------|----------|--------|
| Hover / toggle | `150ms`–`200ms` | default (`ease-out`) |
| Enter | `200ms` | `ease-out` |
| Leave | `100ms`–`150ms` | `ease-in` |
| State change (modal, drawer) | `300ms` | `ease-out` |

Enter/leave: `opacity-0 -translate-y-1` ↔ `opacity-100 translate-y-0`.

Focus: `focus-visible:ring-2 focus-visible:ring-primary` (no offset, never `focus:`). With stone as primary, the focus ring resolves to the warm-light end of the scale — quiet but visible.

No animation longer than 400ms in dashboard surfaces. Stagger only on initial page load, never on data refresh. `prefers-reduced-motion` collapses entrance animations to instant opacity.

**Hover signature.** Primary CTAs lift 1px (`hover:-translate-y-px`) with a soft shadow, press scales to `0.99`. That's the brand interaction moment — restrained gesture vocabulary in place of the old cyan glow.

---

## Manual Review Checklist

These rules are NOT enforced by components:

- Nuxt UI shorthands first; `var(--ui-*)` only for opacity modifiers
- No `text-gray-*`, `bg-gray-*`, `text-neutral-*`, `bg-neutral-*`, `text-slate-*`, `text-zinc-*`, `bg-slate-*`, `bg-zinc-*` — use stone-resolved `--ui-*` semantic tokens. Exception: social-preview cards (see Design Decisions)
- No saturated brand color (cyan, blue, violet, indigo) in chrome — primary resolves to stone via `bg-inverted` / `text-inverted`. Saturated color is only allowed for `semanticColors` and `cwvMetricColors`
- No hardcoded hex / rgb / rgba in component templates (status hex go through `semanticColors` / `cwvMetricColors`)
- No `bg-white` / `text-black` for surfaces (use tinted scale)
- No `backdrop-blur-*`, no `.glass`, no `.bg-mesh`, no `.text-gradient-score`. Flat surfaces only
- No drop shadows on cards (`shadow-sm` on tooltips / popovers / modals only)
- No gradient backgrounds anywhere — including logo tile
- No `light:` variants — dark-only
- No nested cards — flatten with spacing and dividers
- No zebra striping in tables
- No bouncy / elastic easing — `ease-out` or damped springs
- No emoji in UI copy
- `useHumanFriendlyNumber()` for all displayed counts
- `useHumanMs(ms)` / `formatMs(ms)` for all durations
- `formatBytes(bytes)` for all byte counts
- Border radius: `rounded-full` (avatars, status dots), `rounded-md` (badges), `rounded-lg` (buttons, inputs), `rounded-xl` (cards). Global `--ui-radius: 0.625rem` (10px)
- `UButton` ghost only inside dense toolbars; outline for secondary; solid for primary CTAs (resolves to inverted/light end of stone)
- "View report" is canonical for opening a scan result. Don't override with "Open", "See details", "View"
- `font-mono` + `truncate` + tooltip for URLs / selectors / routes in tables
- `transition-colors` for hover; `transition-[width]` for bars; `transition-all` only for enter/leave
- Numeric columns right-aligned; tabular-nums always
- Tap targets ≥ 44 × 44px on mobile
- Body text ≥ 14px (prefer 16px)
- Contrast AA minimum

---

## Composables & Utilities

| Function | Source | Purpose |
|----------|--------|---------|
| `semanticColors` | `utils/index.ts` | Status color sets (`success / warning / error / neutral`) |
| `thresholdToSemantic(value, good, poor)` | `utils/index.ts` | Map a numeric value against thresholds to a semantic status |
| `thresholdHex(value, good, poor)` | `utils/index.ts` | Hex output for chart rendering |
| `cwvMetricColors` | `utils/index.ts` | LCP / INP / CLS identity hex |
| `calcTrendPercent(current, base)` | `utils/index.ts` | Trend percent for delta arrows |
| `useHumanFriendlyNumber(n, decimals?)` | `utils/index.ts` | Format 1.2K, 45M |
| `useHumanMs(ms)` | `utils/index.ts` | Format ms / s |
| `formatBytes(bytes, decimals?)` | `utils/index.ts` | Format B / KB / MB |
| `formatMs(ms)` | `composables/dashboard.ts` | Lighthouse-flavoured ms formatter |
| `getScoreColor(score)` | `composables/dashboard.ts` | Lighthouse-score text color class |
| `getScoreBg(score)` | `composables/dashboard.ts` | Lighthouse-score background color class |
| `extractFgColor(str)` / `extractBgColor(str)` | `utils/index.ts` | Parse a11y contrast audit failure strings |
| `useDashboard(scanId)` | `composables/dashboard.ts` | Lazy fetchers for summary / performance / a11y / best-practices / seo / crux |
| `useUnlighthouse()` / `apiUrl` | `composables/unlighthouse.ts` | API client + base URL ref |
| `useHistory()` | `composables/history.ts` | Scan history listing + filters |
| `useScan()` | `composables/scan.ts` | Active scan state |
| `useSearch()` | `composables/search.ts` | Route / scan search |

---

## Custom Utilities (in `main.css`)

| Class / Token | What it does | When to use |
|---------------|--------------|-------------|
| `.nums-tabular` | `font-variant-numeric: tabular-nums` | All numeric readouts (scores, metrics, table cells) |

(The frost-era utilities — `.glass`, `.glass-elevated`, `.bg-mesh`, `.text-gradient-score`, `--color-glass-*`, `--color-mesh-*` — are slated for removal in the token pass. Don't author against them.)

---

## Design Decisions

- **Stone as both primary and neutral**: one warm-gray scale drives the whole interface; saturated brand color is intentionally absent from chrome. Replaces the prior `primary: cyan / neutral: slate` split. Editorial, professional, closer to Stripe / Notion than to colorful SaaS dashboards. CTAs read as typographic moments via `bg-inverted` / `text-inverted`, not splashes of color.
- **Flat surfaces over glass**: dropped `backdrop-blur`, `.glass`, `.bg-mesh`, the cyan-glow button shadow, and the cyan→blue logo gradient. With no saturated accent underneath, glass was blur for blur's sake. Flat tinted surfaces let typography and the tier ladder do the hierarchy work.
- **Monochrome logo**: the cyan→blue gradient tile is retired. The logo renders in stone tones — the brand mark is the wordmark and the icon shape, not the color.
- **Severity mapping collapses to 3 buckets**: `critical` + `serious` → `error`, `moderate` → `warning`, `minor` + `info` → `info`. Rationale: semantic palette only exposes 3 status colors and the `info` token is reserved for neutral/meta. Stronger signal per bucket beats a 5-shade spread. Applied in `SeverityBadge.vue`, `accessibility.vue` severity meta, `best-practices` route counts.
- **Web-vital "needs improvement" uses `warning` (amber)**: aligned with Lighthouse and CrUX convention. Previously cyan (primary) — rejected because cyan reads as system action, not caution. Applied in `performance.vue` `getVitalColor` / `getVitalBg`, `summaryStats`, and distribution bars in `CruxMetricCard.vue`.
- **Dark-only — light-mode fallbacks dropped**: `ssr: false` + `colorMode.preference: 'dark'` means light-mode pairs (`bg-white dark:bg-gray-900`, etc.) are dead code. Stripped from `ModalThumbnails.vue`, `LighthouseThreeD.vue`, `error.vue`.
- **Social preview cards keep raw brand colors**: SEO `pages/results/[scanId]/seo.vue` lines 236–241 (brand icons) and 499–570 (Google / X / Facebook / LinkedIn / Slack / Discord preview cards) intentionally use `text-blue-500`, `bg-gray-100`, `bg-neutral-900` etc. to mimic real platform UI. These are documentation surfaces, not design-system surfaces — do not "fix" them.
- **No display font**: dashboard UI doesn't earn a separate display family. Headings use Satoshi at heavier weights and tracking. With chrome stripped of saturation, typography carries the hierarchy — lean on weight and size, not a second face.
- **CrUX colors are fixed across pages**: LCP indigo, INP sky, CLS purple — registered in `cwvMetricColors`. Never reassigned per page; identity must stay constant. These plus `semanticColors` are the only saturated colors permitted anywhere in the app.

---

## Deferred Work

- **Token pass**: switch `app.config.ts` to `primary: 'stone'` / `neutral: 'stone'`. Rebuild `main.css`: drop `--color-glass-*`, `--color-mesh-*`, `.glass`, `.glass-elevated`, `.bg-mesh`, `.text-gradient-score`; replace stone-resolved `--ui-*` tokens for `:root, .dark`. Strip `backdrop-blur-*` and cyan-glow shadow from `app.config.ts` card / button / modal / tabs / input slots.
- **`semanticColors` parity with pro**: add `bg`, `border`, and `dot` slots to each `semanticColors[*]` entry so `SeverityBadge`, `IssueRow`, and CWV distribution bars compose from one source instead of inlining `bg-error/10 border-error/20`.
- **Motion + shadow token system**: add `--ease-standard` / `--ease-spring` / `--ease-exit` and `--shadow-card` / `--shadow-overlay` / `--shadow-focus` so the Motion and Components tables stop describing inline values.
- **Logo refresh**: replace the cyan→blue gradient tile in `DashboardShell.vue`, `onboarding.vue`, `scan.vue`, and `index.vue` progress bars with a monochrome stone treatment.
- **`MetricGuage.vue` → `MetricGauge.vue` rename**: original component file was empty and has been removed alongside its orphan `.guage__*` CSS. If a score-gauge component is reintroduced, name it `MetricGauge` and expose theme tokens (`--ui-success`, `--ui-warning`, `--ui-error`) instead of hardcoding Tailwind colors.
- **Route-based tabs**: not currently used. When adopted (e.g. splitting `accessibility.vue` into sub-routes), use `UTabs variant="link"` with a white underline indicator at `data-[state=active]:text-highlighted`.
- **Strict AA contrast for `text-dimmed` at sub-14px**: axe-core flagged 6 violations in the prior layout review. Revisit when shifting to stone neutrals — warm-grays may resolve some of these.
