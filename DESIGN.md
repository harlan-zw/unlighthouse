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

## Architecture: design-system layer

Shared UI primitives live in a Nuxt layer at `packages/ui/layers/design-system/`. The layer ships components (`Ui*`), composables, types, and utils — no domain logic. Page-level components and Cell renderers live in `packages/ui/components/`.

The layer is wired via `extends: ['./layers/design-system']` in `packages/ui/nuxt.config.ts`. Layer components auto-register globally; consume them as `<UiTooltip>`, `<UiProgressCircle>`, etc.

When adding a primitive that two surfaces would share, author it in the layer. Domain-bound or Unlighthouse-specific UI (cells, scan progress, audit rendering) stays in `components/`.

---

## Colors

### Mode

Dark only. `colorMode.preference: 'dark'`, `ssr: false`. No `light:` variants — stripping them is mandatory; light-mode class pairs are dead code and a known review hard reject.

### Identity: Mauve

**Mauve serves as both primary and neutral.** One low-chroma editorial scale (hue 286) drives the whole interface; saturated brand color is intentionally absent from chrome. The interface reads editorial and professional — closer to Stripe / Linear / Notion than to a colorful SaaS dashboard.

```ts
// app.config.ts — preset name kept as 'stone'; visual values come from
// --ui-color-neutral-* CSS var overrides in main.css.
ui: { colors: { primary: 'stone', neutral: 'stone' } }
```

```css
/* assets/css/main.css */
--ui-color-neutral-50:  oklch(98.5% 0     0);
--ui-color-neutral-100: oklch(96.7% 0.001 286.375);
--ui-color-neutral-200: oklch(92%   0.004 286.32);
--ui-color-neutral-300: oklch(87.1% 0.006 286.286);
--ui-color-neutral-400: oklch(70.5% 0.015 286.067);
--ui-color-neutral-500: oklch(55.2% 0.016 285.938);
--ui-color-neutral-600: oklch(44.2% 0.017 285.786);
--ui-color-neutral-700: oklch(37.4% 0.016 285.822);
--ui-color-neutral-800: oklch(27.4% 0.006 286.033);
--ui-color-neutral-900: oklch(21%   0.006 285.885);
--ui-color-neutral-950: oklch(14.1% 0.005 285.823);
```

Dark tier ladder `14 → 21 → 27 → 37` (bg → muted → elevated → accented) gives nav / body / cards / hover visible hierarchy without breaking "no pure black".

- **Primary CTAs** resolve to near-white over the mauve-dark base (`bg-inverted` / `text-inverted`) — the "lit from above" Vercel / Linear pattern. The CTA reads as a typographic moment, not a colored splash.
- **Active nav, selected rows, hovered links** use `text-highlighted` and `bg-elevated`, never a saturated tint.
- **Logo is monochrome.** No gradient tile, no cyan / blue split.

### Semantic Tokens (never hardcode hex)

**Text:** `text-default`, `text-muted` (secondary), `text-dimmed` (tertiary), `text-highlighted` (active), `text-toned` (nav labels)

**Backgrounds:** `bg-default` (page), `bg-elevated` (cards), `bg-muted` (pills), `bg-accented` (hover)

**Borders:** `border-default`, `border-accented` (active)

**Inverted:** `bg-inverted`, `text-inverted` — used for primary CTAs (auto-flips to the bright end of the scale in dark mode).

> Prefer Nuxt UI shorthands. Use `[var(--ui-*)]` only for opacity modifiers. Every `--ui-*` resolves from the mauve scale in `:root, .dark` (see `assets/css/main.css`).

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

For hero stat readouts (Summary score, CrUX values), use `.numerals-display` — tabular numerals + `ss01` for design-tuned digit shapes.

For short uppercase labels above headlines on landing / onboarding surfaces, use `.eyebrow`. Don't use in dashboards — lean on weight/tier hierarchy.

Avoid the top-5 web fonts (Inter, Roboto, Open Sans, Lato, Montserrat, `system-ui`). Satoshi's geometric character reads engineered and editorial against the mauve neutrals; JetBrains Mono pairs visually.

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
| Navigation, section labels, list headers | `UiNavIcon` (primary-tinted box) or `text-dimmed` / `text-muted` |
| Severity badge icon | Inherits from `SeverityBadge` color slot |

### `UiNavIcon`

Presentation icon container for sidebar navigation, card headers, status rows. Default variant is primary-tinted; semantic variants (`success`, `warning`, `error`, `info`, `experimental`) use low-alpha skewed tints of semantic tokens. Use this instead of bare `<UIcon>` for any chrome icon that needs a visible container; use a bare `<UIcon>` when the icon sits inline with text.

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

Borders sit at `border-default` and shift to `border-accented` on active. Cards use a single hairline border, never a drop shadow. The only shadows permitted are the 5-layer overlay shadow (`.ui-popover-content`) on popovers / tooltips / modals where the surface needs to read as floating.

### Surface Utilities

For shared treatments where component slots aren't enough, compose with the utilities in `main.css`:

| Utility | Use |
|---------|-----|
| `.surface-soft` | Translucent feature cards on landing surfaces (border + `--shadow-card` + hover border shift) |
| `.surface-stat` | Stat tiles (same chrome as `.surface-soft`, ships with `p-5`) |
| `.surface-link` | Hoverable marketing/index card with ring + bg shift |
| `.surface-inset` | Nested content one tier deeper than the parent card (code rows, mini-stats) |
| `.marketing-pill` / `.marketing-label` | Pill / label chrome on hero surfaces |
| `.ui-popover-content` | 5-layer overlay shadow + inset bevel for tooltips / popovers / modals |

Tune surface treatments here, not per-page.

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
- `Summary` (avg-score progress circle + stat row) — for the scan overview page
- Three `CruxMetricCard` (LCP/INP/CLS row) — for performance
- Filter bar + scan list — for the index

Never mix two hero patterns. Primary charts sit borderless below the hero, never inside their own bordered card on top of it.

### Density

Density tokens in `:root` provide dashboard defaults:

```css
--density-card-padding: 0.75rem;
--density-element-gap: 0.5rem;
--density-section-gap: 1.5rem;
```

| Mode | Layout |
|------|--------|
| **Data-rich** (default) | Tight gaps (`gap-2`–`gap-3`), compact cards (`p-3`–`p-4`), paginated tables |
| **Onboarding** | Centered hero (`py-12`+), single CTA, sparse cards |
| **Scan-in-progress** | Live progress as hero, status feed as secondary |

When a scan has no completed audits yet, the progress feed IS the hero. Score blocks render as skeletons until data arrives.

---

## Components

### Layer primitives (`Ui*` — `layers/design-system/components/`)

| Component | Purpose |
|-----------|---------|
| `UiTooltip` | Tooltip primitive on reka-ui directly (skips `UTooltip` wrapper). Props: `title`, `description`, `text`, `html`, `label`, `size` (`xs`–`xl`). Slot `#text` for rich body. |
| `UiHelpLabel` | Inline `label + (?) icon` that mounts a tooltip — for column headers, stat labels. Plain string body only. |
| `UiNavIcon` | Tinted-box presentation icon — sidebar nav, card headers, status rows. Variants: `default` (primary-tinted), `success / warning / error / info / experimental`. |
| `UiProgressCircle` | SVG progress ring — score gauges, Summary hero. Props: `percent`, `size`, `strokeSize`, `lighter`. |
| `UiMotionButton` | `UButton` drop-in with motion-v lift / press / cursor-tracked spotlight. Auto-infers `intensity` (`subtle/default/cta`) from `size + variant`. Use for primary CTAs only — dense toolbars stay on plain `<UButton>`. |
| `UiPillSelect` | Segmented pill toggle for ≤4 mutually-exclusive options. Replaces `USelectMenu` for short value sets. |
| `UiPopover` | Popover primitive with shared overlay chrome. |
| `UiTooltipGrid` / `UiTable*` / `UiDataTableSection` | Dense data surfaces. Use directly or compose page tables. |

Motion-v is wired globally via `LazyMotion` + `MotionConfig reduced-motion="user"` in `app.vue`.

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
| `Summary` | `UiProgressCircle` + status word + horizontal stat row (overview hero) |
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
| `CellLargestContentfulPaint` / `CellLayoutShift` / `CellWebVitals` | Web vital cells with threshold coloring + `UiTooltip` for definitions |
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
| `ResultsCell` | Generic results cell wrapper (uses `UiTooltip` for details popouts) |
| `ResultsTableHead` | Table header with sort affordance + `UiTooltip` for column docs |

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
| `LighthouseThreeD` | Hero illustration (onboarding only) — render in monochrome mauve tones |

### Tabs

Three patterns, each with a distinct **intent** and a distinct **active treatment**. Pick by what the tab navigates, not by look.

| Pattern | Intent | Component / variant | Active treatment | Example |
|---------|--------|---------------------|------------------|---------|
| **Pill toggle (≤4 options)** | Non-routing, mutually-exclusive in-page filter | `UiPillSelect` | `bg-default` shadow-sm | results filter (`All / Worst 5 / Best 5 / Below 50`) |
| **Section view-mode toggle** | Non-routing, in-page state switch (5+ options) | `UTabs variant="pill"` | `bg-accented` pill (quiet, monochrome) | `performance.vue` Web Vitals / Images / Third-Party / Routes |
| **Form-factor toggle** | Switch dataset (phone ↔ desktop CrUX) | `UiPillSelect` or `UTabs variant="pill" size="xs"` | Pill indicator | `performance.vue` phone/desktop CrUX |
| **Route-based tabs** | Routes between sibling pages (reserved) | `UTabs variant="link"` | White underline + `text-highlighted` | — |

**Rules:**
- No icons on view-mode toggles. Labels only.
- Tab indicator stays monochrome — never a saturated brand tint.
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

**Unovis theming** is wired in `main.css` — grid / tick / tooltip vars resolve to semantic tokens, so charts inherit the mauve surface automatically.

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

## Radius

Editorial-flat, not pill-soft. The token `--ui-radius: 0.375rem` (6px) drives Nuxt UI components.

| Radius | Usage |
|--------|-------|
| `rounded-full` | Dots, avatars, status pills, scan-status chip |
| `rounded-md` (6px) | Badges, buttons, inputs (resolves from `--ui-radius`) |
| `rounded-lg` (8px) | Cards, panels, modals, tooltips, popovers — the canonical surface tier |

`rounded-xl` / `rounded-2xl` are intentionally absent in component templates. If a surface looks soft, it's likely over-rounded; drop one tier.

---

## Motion

Motion-v is wired globally (`app.vue`) with `reduced-motion="user"`. Easing tokens in `main.css`:

```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-exit:     cubic-bezier(0.4, 0, 1, 1);
```

| Context | Duration | Easing |
|---------|----------|--------|
| Hover / toggle | `150ms`–`200ms` | `--ease-standard` |
| Enter | `200ms` | `--ease-standard` |
| Leave | `100ms`–`150ms` | `--ease-exit` |
| State change (modal, drawer) | `300ms` | `--ease-standard` |
| Reveal with overshoot (badges, score) | `400ms` | `--ease-spring` |

Enter/leave: `opacity-0 -translate-y-1` ↔ `opacity-100 translate-y-0`. Use the page transition (`.page-enter-*`) and `.slide-up-*` classes in `main.css` directly, or compose with motion-v.

Focus: `focus-visible:ring-2 focus-visible:ring-accented` (no offset, never `focus:`).

No animation longer than 400ms in dashboard surfaces. Stagger only on initial page load, never on data refresh. `prefers-reduced-motion` collapses entrance animations to instant opacity (handled in `main.css`).

**Hover signature.** Primary CTAs lift 1px (`hover:-translate-y-px`) with a soft shadow, press scales to `0.99`. `UiMotionButton` layers cursor-tracked spotlight + halo + specular sweep on top for CTA intensity — that's the brand interaction moment. Dense toolbars stay on plain `<UButton>` (no FX).

---

## Manual Review Checklist

These rules are NOT enforced by components:

- Nuxt UI shorthands first; `var(--ui-*)` only for opacity modifiers
- No `text-gray-*`, `bg-gray-*`, `text-neutral-*`, `bg-neutral-*`, `text-slate-*`, `text-zinc-*` — use mauve-resolved `--ui-*` semantic tokens. Exception: social-preview cards
- No saturated brand color in chrome — primary resolves to mauve via `bg-inverted` / `text-inverted`. Saturated color is only allowed for `semanticColors` and `cwvMetricColors`
- No hardcoded hex / rgb / rgba in component templates (status hex go through `semanticColors` / `cwvMetricColors`)
- No `bg-white` / `text-black` for surfaces (use tinted scale)
- No `backdrop-blur-*`, no `.glass`, no `.bg-mesh`, no `.text-gradient-score`. Flat surfaces only
- No drop shadows on cards (5-layer overlay shadow via `.ui-popover-content` for tooltips / popovers / modals only)
- No gradient backgrounds anywhere — including logo tile
- No `light:` variants — dark-only
- No nested cards — flatten with spacing and dividers
- No zebra striping in tables
- No bouncy / elastic easing — `--ease-standard` or `--ease-spring`
- No emoji in UI copy
- No `rounded-xl` / `rounded-2xl` in component templates — use `rounded-lg` (cards) or `rounded-md` (buttons / inputs)
- `useHumanFriendlyNumber()` for all displayed counts
- `useHumanMs(ms)` / `formatMs(ms)` for all durations
- `formatBytes(bytes)` for all byte counts
- `UButton` ghost only inside dense toolbars; outline for secondary; solid for primary CTAs (resolves to inverted/light end of mauve). `UiMotionButton` for hero CTAs only
- "View report" is canonical for opening a scan result. Don't override with "Open", "See details", "View"
- `font-mono` + `truncate` + `UiTooltip` for URLs / selectors / routes in tables
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

## CSS Tokens & Utilities (in `main.css`)

### Tokens

| Token | Purpose |
|-------|---------|
| `--ui-color-neutral-50…950` | Mauve scale (hue 286, low chroma) |
| `--ui-bg / -muted / -elevated / -accented / -inverted` | Surface tier ladder |
| `--ui-text / -dimmed / -muted / -toned / -highlighted / -inverted` | Text tier ladder |
| `--ui-border / -muted / -accented / -inverted` | Border tier ladder |
| `--ui-radius` | 0.375rem (6px) — drives Nuxt UI component radii |
| `--ease-standard / -spring / -exit` | Motion easings |
| `--density-card-padding / -element-gap / -section-gap` | Density tokens — dashboard defaults |
| `--shadow-card / -ring / -focus / -overlay` | Structural shadow tokens |

### Utilities

| Class | What it does |
|-------|--------------|
| `.nums-tabular` | `font-variant-numeric: tabular-nums` for columnar numbers |
| `.numerals-display` | Tabular + `ss01` digit shapes for hero stat readouts |
| `.eyebrow` | Uppercase tracked label — marketing/landing surfaces only |
| `.surface-soft / -stat / -link / -inset` | Shared card / pill / nested-content treatments |
| `.marketing-pill` / `.marketing-label` | Hero pill chrome |
| `.ui-popover-content` | 5-layer overlay shadow + inset bevel — tooltips / popovers / modals |
| `.ui-dropdown-item` | Outline-ring hover, left accent bar on active |
| `.ui-dropdown-lead-icon` | Primary-tinted container behind menu leading icons |
| `.gradient` | Radial hero backdrop (landing surfaces) |
| `.page-enter-* / .slide-up-* / .slide-right / .pop` | Reveal animations |
| `.mega-menu / .mega-column / .mega-item` | Staggered nav-reveal animations |

---

## Design Decisions

- **Mauve as both primary and neutral**: one low-chroma editorial scale (hue 286) drives the whole interface. The preset name in `app.config.ts` is still `'stone'`, but every `--ui-color-neutral-*` is overridden to OKLCH mauve. Replaces the prior stone-as-stone setup — mauve sits flatter against the dark surface and reads more editorial. CTAs read as typographic moments via `bg-inverted` / `text-inverted`, not splashes of color.
- **Flat editorial radii**: dropped `rounded-xl` from cards in favour of `rounded-lg` (8px). `--ui-radius` is `0.375rem` (6px), so buttons / inputs read crisp. `rounded-full` reserved for dots, avatars, scan-status chip.
- **Flat surfaces over glass**: dropped `backdrop-blur`, `.glass`, `.bg-mesh`, the cyan-glow button shadow. Flat tinted surfaces let typography and the tier ladder do the hierarchy work. Overlays (tooltip / popover / modal) get the 5-layer shadow via `.ui-popover-content`.
- **Design-system layer**: shared `Ui*` primitives live in `packages/ui/layers/design-system/` (Nuxt layer, `extends`'d from the main config). Domain UI (cells, scan progress) stays in `components/`.
- **Motion-v wired globally**: `LazyMotion` + `MotionConfig reduced-motion="user"` in `app.vue` is the precondition for `UiMotionButton`. Hero CTAs use it; dense toolbars stay on plain `<UButton>`.
- **Severity mapping collapses to 3 buckets**: `critical` + `serious` → `error`, `moderate` → `warning`, `minor` + `info` → `info`. Stronger signal per bucket beats a 5-shade spread.
- **Web-vital "needs improvement" uses `warning` (amber)**: aligned with Lighthouse and CrUX convention.
- **Dark-only — light-mode fallbacks dropped**: `ssr: false` + `colorMode.preference: 'dark'` means light-mode pairs are dead code.
- **Social preview cards keep raw brand colors**: SEO preview cards intentionally use `text-blue-500`, `bg-gray-100`, etc. to mimic real platform UI. Documentation surfaces, not design-system surfaces.
- **No display font**: dashboard UI doesn't earn a separate display family. Headings use Satoshi at heavier weights and tracking.
- **CrUX colors are fixed across pages**: LCP indigo, INP sky, CLS purple — registered in `cwvMetricColors`. Never reassigned per page.

---

## Deferred Work

- **`semanticColors` parity with pro**: add `bg`, `border`, and `dot` slots to each `semanticColors[*]` entry so `SeverityBadge`, `IssueRow`, and CWV distribution bars compose from one source instead of inlining `bg-error/10 border-error/20`.
- **Logo refresh**: replace the cyan→blue gradient tile in `DashboardShell.vue`, `onboarding.vue`, `scan.vue`, and `index.vue` progress bars with a monochrome mauve treatment.
- **`MetricGuage.vue` → `MetricGauge.vue` rename**: original component file was empty and has been removed alongside its orphan `.guage__*` CSS. If a score-gauge component is reintroduced, name it `MetricGauge` and expose theme tokens (`--ui-success`, `--ui-warning`, `--ui-error`) instead of hardcoding Tailwind colors.
- **Route-based tabs**: not currently used. When adopted (e.g. splitting `accessibility.vue` into sub-routes), use `UTabs variant="link"` with a white underline indicator at `data-[state=active]:text-highlighted`.
- **Strict AA contrast for `text-dimmed` at sub-14px**: revisit once mauve neutrals settle — low-chroma warm-grays may resolve some of the prior violations.
- **`UiNavIcon` adoption sweep**: sidebar nav and card headers still use bare `<UIcon>`. Convert systematically (`DashboardShell`, `NavList`, `DashboardHeader`, `Summary` stat row).
