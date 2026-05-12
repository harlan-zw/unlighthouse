# Polish Contract — packages/ui token cleanup

**Job**: polish-packagesui-0420-1450
**Phase**: 3 (Polish)
**Scope**: Deferred token cleanup flagged in `design-guidelines.md` — replace ~200 hardcoded Tailwind color usages across 24 files with semantic tokens.

## What Will Be Changed

### 1. Severity/status color maps (script setup objects)
- `pages/index.vue:284-291` — getStatusConfig (running/complete/cancelled/failed)
- `pages/results/[scanId]/performance.vue:64-73` — getVitalColor / getVitalBg
- `pages/results/[scanId]/performance.vue:133-135` — summaryStats LCP/CLS/TBT color mapping
- `pages/results/[scanId]/performance.vue:152-158, 175` — topOpportunities type groups
- `pages/results/[scanId]/accessibility.vue:63-66` — critical/serious issue-count map
- `pages/results/[scanId]/accessibility.vue:77-82` — severityMeta (critical/serious/moderate/minor/info)
- `components/Dashboard/SeverityBadge.vue:6-19` — severity config computed
- `components/Audit/AuditResult.vue:33-42` — iconClasses
- `components/Loading/LoadingStatusIcon.vue:8-23` — status color map

### 2. Inline template color classes
- `components/Dashboard/DashboardHeader.vue:63,65` — Good/Poor score-label pills
- `components/Dashboard/Summary.vue:24,26` — Good/Poor labels (duplicate of above)
- `components/Dashboard/CruxMetricCard.vue:137,149,165,184,198` — trend arrows + distribution bars + legend dots
- `components/Results/ResultsTableHead.vue:29` — yellow-500 warning icon
- `components/ErrorBoundary.vue:23-29` — red error surface + icon + heading
- `components/PageError.vue:22-23` — red error icon
- `components/Tooltip.vue:18` — `bg-gray-900/99` tooltip surface
- `components/ModalThumbnails.vue:89-90,173,188` — light-mode fallback pairs (dropped: project is dark-only)
- `components/LighthouseThreeD.vue:169` — `from-sky-50/50 to-sky-300/50` light-mode gradient (dropped)
- `error.vue:31-37` — error page red pill + gray status-code text
- `pages/onboarding.vue:229,233,254,283,294,330,368,387` — form labels (gray-300), resume banner (amber-300)
- `pages/results/[scanId]/accessibility.vue` — ~15 locations: severity text/bg pairs, check-circles, wcag badges, summary strip
- `pages/results/[scanId]/performance.vue:200,212,292,304,349,452` — DashboardHeader icon color, active tab, vital bg pills, histogram gradient, lcp element type badges
- `pages/results/[scanId]/seo.vue:449,459,507,510,522,525,537,540` — length bars + og-image placeholders
- `pages/results/[scanId]/scan.vue:103` — logo tile gradient
- `pages/index.vue:287,289,649,666,671,845` — status icons + progress gradients

### 3. Orange gradient relics (`from-primary-500 to-orange-600`)
- `components/DashboardShell.vue:27,55`
- `pages/onboarding.vue:205`
- `pages/results/[scanId]/scan.vue:103`
- `pages/index.vue:649,845`

Replacement pending user input (see Aesthetic Decisions below).

### 4. Dead code
- `components/MetricGuage.vue` — 0-byte empty file, no consumers; delete
- `assets/css/main.css:71-113` — `.guage__*` CSS classes (orphan after above); strip

### 5. Guidelines update
- Remove Token Cleanup + Score Gradient entries from `## Deferred Work` in `design-guidelines.md`
- Append `## Design Decisions` with any aesthetic choices confirmed below

## Replacement Mapping

| Pattern | Replacement |
|---------|-------------|
| `text-red-400` / `text-red-500` | `text-error` |
| `text-green-400` / `text-green-500` | `text-success` |
| `text-amber-300` / `text-yellow-500` / `text-orange-400` | `text-warning` |
| `text-blue-400` | `text-info` |
| `text-gray-200` / `text-gray-300` | `text-toned` (form labels), `text-muted` (metadata) |
| `text-gray-800` | removed (light-mode fallback in dark-only project) |
| `bg-{color}-500/10` + `border-{color}-500/20` | `bg-{semantic}/10` + `border-{semantic}/20` |
| `bg-gray-500/10` / `border-gray-500/20` | `bg-elevated/60` / `border-default` |
| `bg-gray-700` solid | `bg-elevated` |
| `bg-gray-800` / `bg-gray-900/99` | `.glass-elevated` (tooltip, modal preview) |
| `bg-gray-100` light-mode fallback | dropped |
| `bg-white dark:bg-gray-900` pair | drop light half |
| `from-primary-500 to-orange-600` | **see aesthetic decision 3** |
| `from-green-500 via-amber-500 to-red-500` (CWV histogram) | `from-success via-warning to-error` |

## Aesthetic Decisions (need user input)

### Decision A: Severity label mapping (5 levels → semantic colors)

Accessibility page and SeverityBadge use 5 severity levels but the semantic palette only has 3 status colors. Current raw mapping:

| Level | Current raw colors | Proposed (option 1) | Proposed (option 2) |
|-------|---------|---------------|---------------|
| critical | red-500 / red-400 | error | error |
| serious | orange-500 / orange-400 | error (shared with critical) | warning |
| moderate | primary (cyan) | warning | warning (shared) |
| minor | gray-500 + text-muted | muted/elevated | info |
| info | blue-500 / blue-400 | info | info (shared) |

### Decision B: "Needs improvement" web-vital color

Currently cyan (`text-primary`, `bg-primary/10`) for web-vital ratings between good and poor. Convention on Lighthouse and Chrome UX Report is amber (warning). Frost theme's primary is cyan. Keep cyan (calmer, distinct from the amber "score 50-89" warning band) or switch to warning for convention?

### Decision C: Orange gradient replacement

`from-primary-500 to-orange-600` on logo/icon tiles in DashboardShell, onboarding, scan.vue, plus two progress bars in index.vue. Orange is not in the palette (guidelines `## Avoid` list). Options:
1. Flat `bg-primary` (simple, cyan)
2. `bg-gradient-to-br from-primary to-secondary` (cyan → blue, frost-consistent)
3. `.bg-mesh` applied inside the tile (ambient, may be too subtle at 28-32px)

## Testable Behaviors

- [C1] GIVEN a completed scan, WHEN landing on /history, THEN status icons for complete/failed rows use `text-success` / `text-error` (grep: no `text-{red,green}-400` in pages/index.vue).
- [C2] GIVEN the accessibility page, WHEN viewing issue rows, THEN severity pills read from semantic tokens (grep: no `text-{red,orange,blue}-400` in accessibility.vue).
- [C3] GIVEN the performance page, WHEN viewing CWV histogram, THEN gradient uses `from-success via-warning to-error` (grep: no `from-green-500` in performance.vue).
- [C4] GIVEN any page with the app logo tile, WHEN rendered, THEN background is the approved replacement from Decision C (grep: no `to-orange-600` anywhere).
- [C5] GIVEN the tooltip component, WHEN displayed, THEN surface uses `.glass-elevated` or glass tokens (grep: no `bg-gray-900` in Tooltip.vue).
- [C6] GIVEN dark-only build, WHEN rendering ModalThumbnails / LighthouseThreeD, THEN no `bg-white` or `bg-gray-100` light-mode fallback classes remain (grep confirms).
- [C7] GIVEN the project build, WHEN inspecting repo, THEN MetricGuage.vue is absent and `.guage__*` CSS is absent from main.css.
- [C8] GIVEN the dev server running, WHEN loading /history, THEN page renders without new console errors vs baseline.
- [C9] GIVEN dark mode (project default), WHEN loading /onboarding, THEN form labels remain legible (contrast ≥ 4.5:1 for labels).
- [C10] GIVEN prefers-reduced-motion, WHEN loading any page, THEN gauge and severity elements respect existing motion rules (no new animations introduced).
- [C11] GIVEN responsive viewport 375px, WHEN loading /history, THEN no horizontal overflow introduced.
- [C12] GIVEN SSR-disabled build, WHEN inspecting page HTML, THEN `ssr: false` remains and no light-mode hydration flashes (no new `bg-white` in critical path).

## Out of Scope

- `guage` → `gauge` rename (noted separately in deferred work; not a token issue)
- Contrast fixes for text-dimmed at sub-14px (prior review PARTIAL item; design-token choice)
- Auto-import name fixes (`<LoadingSkeletonScanCard>` etc. — separate refactor)
- Adding new components, routes, or features
- Visual redesign or layout changes