---
name: Unlighthouse UI
description: Design system for the Unlighthouse dashboard — minimal, professional, editorial; data legibility over visual theatrics.
theme:
  primary: violet
  neutral: slate
  radius: 0.5rem
  fonts:
    sans: Hubot Sans
    display: Hubot Sans
    mono: Fira Code
---

# Unlighthouse UI — Design System

Canonical patterns for the Unlighthouse dashboard. Components enforce most rules automatically; use the right component and the rule follows. This doc covers what components don't enforce, how the layers compose, and where new UI belongs.

These rules implement Unlighthouse's design principle: **minimal, professional, editorial — data legibility over visual theatrics.** Chrome stays monochrome and quiet so audit scores, severity, and metric identity do the talking. When a design choice trades clarity for polish, clarity wins.

The design principle as a tradeoff: **we prioritize data legibility over visual impact.**

---

## Architecture: where UI lives

There are three homes for a component. Pick by ownership and reuse, not by what it looks like. Getting this right is what keeps reuse legible across the app.

### 1. Design-system layer — `packages/ui/layers/design-system/`

Generic UI primitives, tokens, fonts, motion, chart helpers, formatters, and design vocabularies (`Status`, severity, health, data-viz palette). Wired via `extends: ['./layers/design-system']` in `packages/ui/nuxt.config.ts`. Components register globally with `pathPrefix: false` + `priority: 10`, so consume them under their bare name: `<UiButton>`, `<UiTooltip>`, `<UiSparkline>`, `<UiTable>`.

**This layer is a one-way mirror of the canonical design system at `nuxtseo.com`.** Resyncs copy canonical files over local ones; local-only files added here are wiped on the next resync. **Never put Unlighthouse-specific UI in this layer** — domain components (scan tables, score rings, audit findings) do not belong here and will not survive a sync. Treat it as read-only: consume its primitives, don't extend it in-tree.

Primitives must render with prop fixtures alone — no `useFetch`, no API client, no auth/billing state. Domain data arrives via props or slots.

### 2. App-global — `packages/ui/app/components/`

Unlighthouse-wide components shared across two or more unrelated features. Auto-imported under their bare name (`<AppSidebar>`, `<QueryError>`, `<SidebarShell>`). This is where a feature component graduates to once a second feature needs it.

### 3. Feature-local — `packages/ui/app/features/<feature>/components/`

Components scoped to a single feature (`scan`, `sites`, `compare`, `dashboard`). **Not auto-imported** — import them explicitly: `import ScoreRing from '~/features/scan/components/ScoreRing.vue'`. The explicit import is the signal that the component is feature-private; promote to app-global only when a second, unrelated feature imports it.

### Placement decision

```
Is it a generic primitive (button, tooltip, table, sparkline, chip)?
  → it already exists in the DS layer. Use it. Do NOT re-implement.
Is it Unlighthouse-domain UI used by ≥2 unrelated features?
  → app/components/ (auto-imported, bare name)
Is it Unlighthouse-domain UI used by one feature?
  → app/features/<feature>/components/ (explicit import)
```

Before building any primitive from scratch, check the DS layer first. A hand-rolled sparkline, ring, stat card, skeleton, or table is almost always a duplicate of an existing `Ui*` primitive.

---

## Component bans — use the wrapper, not the raw primitive

The DS layer ships opinionated wrappers around Nuxt UI primitives so chrome (shadow, ring, motion, semantics) stays consistent. Raw primitives bypass the design system and are review hard-rejects.

| Raw (banned) | Use instead |
|--------------|-------------|
| `UButton` | `UiButton` |
| `UTooltip` | `UiTooltip` |
| `UPopover` | `UiPopover` |
| `UTable` | `UiTable` |
| `UAlert` | `UiAlert` |
| `UCard` | `UiCard` |
| `USkeleton` | `UiSkeleton` |
| `UChip` | `UiChip` |

`UDrawer`, `USelect`, `UInput`, `UTabs`, `UModal` have no wrapper yet; use them raw, themed via `app.config.ts`.

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
- Empty-state titles sell the value of the feature, not the absence of data ("Run a scan to surface render-blocking resources" > "No scans yet").
- "View report" is canonical for opening a scan result. No "Learn more", "Get started", "Discover", "Unlock".
- Error strings name the failure and the next action in one sentence.
- Button labels are `verb + object`: `Run scan`, `Export results`, `View report`. Never `OK`, `Submit`, or bare verbs.
- Score copy pairs number with status: `92 — passing` not `Good`.
- Severity labels: `critical / serious / moderate / minor / info` — match audit conventions, don't soften.

---

## Diagnose, don't display

Every score, hero metric and audit row earns its place by answering **"so what?"** in a way the user can act on without leaving the page.

- A naked score is a vanity tile. Pair it with a status word (`passing / needs work / poor`) or a delta vs the prior scan.
- Metric cards (`MetricStatCard`) ship value + distribution + percentile row by default. A bare value is incomplete.
- Issue/finding rows carry severity, affected page count, and an expandable page list. A row without affordance is a stat, not a diagnosis.
- Result tables include the action: "View report", "Open route", "Copy selector". If the user has to take a value elsewhere to understand it, the view failed.

---

## Colors

### Mode

Light **and** dark. `colorMode.preference: 'system'`. Every surface must resolve through semantic `--ui-*` tokens so both modes work without per-mode class pairs. Never hardcode a color that only reads in one mode.

### Identity

```ts
// layers/design-system/app/app.config.ts
ui: { colors: { primary: 'violet', neutral: 'slate', pro: 'violet' } }
```

Both `slate` (neutral) and `violet` (primary) are OKLCH scales at hue 292, so neutrals carry a faint violet cast and brand color sits in the same family. The interface reads editorial and professional — closer to Stripe / Linear / Notion than a colorful SaaS dashboard.

- **Primary CTAs** resolve to inverted neutral (`bg-inverted` / `text-inverted`) — near-white on dark, dark slate on light. The "lit from above" Vercel / Linear pattern. The CTA reads as a typographic moment, not a colored splash.
- **Saturated violet is reserved for `color="pro"`** — purchase / upgrade moments only. It is intentionally *not* expressible through `UiButton`'s `purpose` prop; you must drop to a raw `color="pro"` to use it.
- **Active nav, selected rows, hovered links** use `text-highlighted` and `bg-elevated`, never a saturated tint.

### Semantic tokens (never hardcode hex)

**Text:** `text-default`, `text-muted` (secondary), `text-dimmed` (tertiary), `text-highlighted` (active), `text-toned` (labels), `text-inverted` (on CTAs).

**Backgrounds:** `bg-default` (page), `bg-elevated` (cards), `bg-muted` (pills), `bg-accented` (hover), `bg-inverted` (CTAs).

**Borders:** `border-default`, `border-accented` (active).

Prefer Nuxt UI shorthands. Use `[var(--ui-*)]` only for opacity modifiers or `color-mix()`. Never write a raw hex in a template; route status hex through the composables below.

### Status & vocabulary colors

Saturated color in chrome is permitted only when it encodes information. Source it, never inline it.

| Need | Source (`layers/design-system/app/composables/`) |
|------|--------------------------------------------------|
| Status (`success / error / warning / info / neutral`) | `semanticColors`, `thresholdToSemantic(value, good, poor)`, `thresholdHex(...)` |
| Health rollup (`healthy / attention / issues / unknown`) | `healthToSemantic`, `healthColors` |
| Chart series identity | `dataVizColors` (`vizColorMap`) |
| Lighthouse score → color / label | `useScoreColor()` (app) — `scoreToColor`, `scoreToBg`, `scoreToRingColor`, `scoreToLabel` |

Lighthouse thresholds: `>= 0.9` success, `>= 0.5` warning, `< 0.5` error.

### Color budget

Before adding any non-neutral color: does it encode a status, a health state, or a chart series identity? If yes, use the matching composable. If it's decoration, use a neutral token and don't ship the color.

---

## Typography

| Token | Font | Usage |
|-------|------|-------|
| `--font-sans` / `--font-display` | Hubot Sans (variable, wght 200–900, wdth 75–125%) | Body, UI, headings |
| `--font-mono` | Fira Code | URLs, route paths, status codes, raw audit output |

Hubot Sans is a single variable family driving both body and display via axis tokens — there is no separate display font. Avoid the top-5 web fonts (Inter, Roboto, Open Sans, Lato, Montserrat) and bare `system-ui`.

**Type axes** (`:root` in `css/global.css`, the single source of truth):

```css
--wght-body: 430;  --wght-emphasis: 540;  --wght-heading: 620;  --wght-title: 680;  --wght-numeral: 560;
--wdth-body: 100%; --wdth-heading: 92%;   --wdth-numeral: 95%;
--tracking-tight: -0.02em; --tracking-snug: -0.01em; --tracking-eyebrow: 0.08em;
--size-title: 1.5rem; --size-heading: 1.125rem; --size-subheading: 1rem;
```

`.dashboard-theme` overrides the size tokens to a denser tier (title 1rem / heading 0.8125rem / sub 0.75rem) and sets tabular numerals globally. Use the semantic text classes (`.text-title`, `.text-heading`, `.text-subheading`, `.numerals-display`, `.eyebrow`) so context retunes them automatically.

Use `tabular-nums` / `.numerals-display` on every columnar or hero number — scores, durations, byte counts, percentages. Type scale is rem-fixed; this is application UI, avoid `clamp()` fluid scales in dashboard text. With chrome stripped of saturation, typography carries the hierarchy color used to provide — lean on size, weight, and width axes.

---

## Surfaces, elevation & radius

Flat tinted surfaces. **No backdrop blur, no glass, no mesh, no gradient backgrounds.** Hierarchy comes from the surface tier ladder (`bg-default` → `bg-muted` → `bg-elevated` → `bg-accented`) and a two-tier depth system.

Depth lives in CSS vars (not Tailwind `shadow-*`, which would inline at build and break the runtime remap). Components reference **only** the presets:

| Preset | Use |
|--------|-----|
| `--elevation-inset` | Recessed carved edge — resting stat cards, skeletons |
| `--elevation-flat` | 1px hairline, zero lift — dashboard cards, table shells |
| `--elevation-raised` | Resting drop shadow + bevel — marketing cards, hover |
| `--elevation-overlay` | Atmospheric shadow — modals, drawers, alerts |
| `--elevation-popover` | Atmospheric + brand bevel — tooltips, popovers, dropdowns |
| `--elevation-emphasis` | The one in-page contrast move — max one surface per page |
| `--elevation-hover` | Accent-tinted halo, hover-only |

`.dashboard-theme` remaps `--elevation-raised` → `--elevation-flat`, so dashboard cards resolve to a hairline ring and sit flat instead of floating. `--shadow-focus` is the standalone focus ring, orthogonal to the ladder.

**Radius** — `--ui-radius: 0.5rem`. `rounded-full` for dots / avatars / status pills; `rounded-md` for badges / buttons / inputs; `rounded-lg` for cards / panels / modals / tooltips / popovers. `rounded-xl` / `rounded-2xl` are absent by design — if a surface looks soft, drop a tier.

---

## Buttons

`UiButton` exposes one styling knob: a semantic `purpose` prop. There is no raw `color` / `variant`.

| `purpose` | Intent | Resolves to |
|-----------|--------|-------------|
| `cta` | Primary commit / page action | neutral solid (inverted) |
| `secondary` (default) | Alternative action | neutral outline |
| `quiet` | Low-emphasis: icon-only, inline, nav, alerts | neutral ghost |
| `danger` | Destructive | error soft (ghost when icon-only) |
| `link` | Tertiary action below a cta/secondary | neutral link, no chrome |

`cta` at `lg`/`xl` gets the full cursor-tracked CTA motion; smaller and `quiet` buttons stay subtle. For the saturated violet purchase button, drop to a raw `<UButton color="pro" variant="solid">` — `purpose` deliberately can't express brand violet.

---

## Spacing, density & motion

4pt base grid: `1 2 3 4 6 8 12 16`. Avoid `5 7 9 10 11`. Density tokens (`--density-card-padding`, `--density-element-gap`, `--density-section-gap`) are the central knobs consumed by `UiCard` — tune there, not per-page. Dashboards use the compact end; reserve generous spacing (`py-12`+) for onboarding / marketing surfaces.

Motion-v is imported directly in components (`import { m } from 'motion-v'`) — there is no Nuxt module in this version. Easing tokens:

```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-exit:     cubic-bezier(0.4, 0, 1, 1);
```

Hover/toggle 150–200ms standard; enter 200ms standard; leave 100–150ms exit; reveal-with-overshoot 400ms spring. No animation over 400ms in dashboard surfaces. Stagger only on initial load, never on data refresh. `prefers-reduced-motion` collapses entrances to instant opacity. Focus uses `focus-visible:ring-2`, never `focus:`.

---

## Data visualization

Charts and sparklines come from the DS layer — `UiSparkline`, `UiStat` / `UiStats`, `UiTrend`, `UiTable*`, plus the chart-frame helpers (`UiChartFrame`, `UiChartTooltip`, `useChartHover`, `useChartBrush`, `useChartTickPlan`). Series colors resolve through `dataVizColors`; metric/score color through `useScoreColor`. A sparkline without a legend uses a neutral token. Distribution histograms color bars by threshold band via the semantic palette. Never hand-roll a chart primitive the layer already ships.

---

## Formatting

Display values go through shared formatters, never inline `toFixed` / `Intl` calls.

| Need | Source |
|------|--------|
| Friendly counts (1.2K, 45M) | `useHumanFriendlyNumber` (`formatting.ts`) |
| Plain number / percent / currency | `formatNumber`, `formatPercent`, `formatCurrency` (`formatting.ts`) |
| Relative time | `formatTimeAgo` (`formatting.ts`) |
| Trend delta % | `calcTrendPercent` (`formatting.ts`) |
| Clamp / percent-change math | `clamp`, `percentChange` (`utils/number.ts`) |
| App-side formatting helpers | `useFormat()` (`app/composables/useFormat.ts`) |

---

## Manual review checklist

Rules not enforced by components:

- Use DS wrappers, never the raw banned primitives (see Component bans).
- No new components in `layers/design-system/` — it is a mirror; app UI goes in `app/components/` or `app/features/*/components/`.
- Check the DS layer before hand-rolling any primitive (sparkline, ring, stat, skeleton, table).
- No `text-gray-*` / `slate-*` / `zinc-*` / `stone-*` literals — use semantic `--ui-*` tokens. Both light and dark must resolve.
- No hardcoded hex / rgb / rgba in templates; status color goes through `semanticColors` / `dataVizColors` / `useScoreColor`. Inline `:style` for *computed geometry* (width / height / left) or *sourced colors* is fine.
- No `bg-white` / `text-black`, no `backdrop-blur`, no glass / mesh / gradient backgrounds.
- No drop shadows on cards beyond the elevation presets; overlays use `--elevation-popover`.
- No `rounded-xl` / `rounded-2xl`; cards `rounded-lg`, controls `rounded-md`.
- No emoji in UI copy. No bouncy easing beyond `--ease-spring`.
- `font-mono` + `truncate` + `UiTooltip` for URLs / selectors / routes in tables.
- Numeric columns right-aligned, `tabular-nums`. Tap targets ≥ 44×44px on mobile. Body text ≥ 14px (prefer 16px). Contrast AA minimum.
- "View report" is the canonical label for opening a scan result.

---

## Design Decisions

- **DS layer is a canonical mirror, not editable in-tree.** `packages/ui/layers/design-system` is copied one-way from `nuxtseo.com`. Adopt it as-is; never add Unlighthouse-specific components there (a resync wipes them). App UI lives in `app/components/` (cross-feature) or `app/features/*/components/` (feature-local, explicit import).
- **Light + dark via `system`.** The dashboard is an SPA (`ssr: false`) with `colorMode.preference: 'system'`. Every surface resolves through semantic tokens; no per-mode class pairs.
- **Violet primary, slate neutral, both at hue 292.** Neutrals carry a faint violet cast so the interface reads editorial. Saturated violet is reserved for `color="pro"` (purchase moments); standard CTAs invert to neutral (`bg-inverted`).
- **`UiButton` is purpose-driven.** `cta / secondary / quiet / danger / link` map to fixed color+variant pairs; there is no raw `color`/`variant` knob. Brand violet requires dropping to a raw `UButton color="pro"`.
- **Hubot Sans is the only family.** One variable font (wght 200–900, wdth 75–125%) drives body and display via axis tokens; Fira Code for mono. No separate display family.
- **Two-tier elevation in CSS vars.** Components reference `--elevation-*` presets only; `.dashboard-theme` remaps `raised → flat` so dense data surfaces sit on a hairline ring.
- **Sparkline consolidated onto `UiSparkline`.** The feature-local `features/sites/components/Sparkline.vue` was a hand-rolled duplicate of the DS primitive and was removed; the dashboard sites table renders the score trend through `UiSparkline` (resolved via `resolveComponent` for the TanStack cell).
- **One table: `UiTable`.** The app's parallel `DataTable` (a second TanStack implementation) was deleted; every table — route lists, scan history, the compare delta table, and the per-category route-score tables — now renders through the canonical `UiTable`. Column meta moved from TanStack's `meta: { align, headClass, cellClass }` to top-level column props that `UiTable` reads directly. `UiTable` gained three additive capabilities to absorb `DataTable`'s API: a `#actions` trailing-column slot, a `rowClass(row)` prop (selection highlight), and `defineExpose({ table })` (column-visibility menus). **These additions must be upstreamed to the canonical design system at nuxtseo.com** — the DS layer is a one-way mirror, so a resync would otherwise drop them.
- **Compare feature is fully typed.** `report`/`packReport` derive from the typed API client (`compare.detail` / `compare.run` → `CompareReport`); route rows use the contract's `CompareRouteRow`, and metric lookups key off `MetricKey = keyof CompareRouteRow['deltas']` rather than `any`-indexing.
