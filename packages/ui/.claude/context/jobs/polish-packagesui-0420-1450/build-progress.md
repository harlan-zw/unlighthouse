# Polish Progress — packages/ui

## Audit
- Counted 200 hardcoded Tailwind color usages across 24 Vue files (grep baseline).
- Confirmed prior `layout-rework-review` HARD REJECTs already resolved (no `useHead` color-mode forcing in `DashboardShell.vue`; `colorMode.preference: 'dark'` set in `nuxt.config.ts`; semantic `getScoreColor`/`getScoreBg` in `composables/dashboard.ts`).
- `MetricGuage.vue` is 0 bytes with no consumers. `.guage__*` CSS in `main.css` also unreachable.

## Decisions confirmed with user
- Severity mapping collapses to 3 buckets (critical+serious→error, moderate→warning, minor+info→info).
- Web-vital "needs improvement" switches from cyan to warning (amber) — Lighthouse convention.
- Logo/tile gradient replaces `from-primary-500 to-orange-600` with `from-primary to-secondary`.

## Changes
- Severity/status color maps migrated to semantic tokens in `SeverityBadge.vue`, `AuditResult.vue`, `LoadingStatusIcon.vue`, `DashboardHeader.vue`, `Summary.vue`, `CruxMetricCard.vue`, `accessibility.vue`, `performance.vue`, `best-practices.vue`, `scan.vue`, `index.vue`.
- Inline template color classes (`text-{red,green,blue,orange,purple,pink}-400`, `bg-{color}-500/10`, etc.) replaced across pages and components.
- Orange gradient relics replaced in `DashboardShell.vue`, `onboarding.vue`, `scan.vue`, `index.vue`.
- CWV histogram gradient in `performance.vue` switched from `from-green-500 via-amber-500 to-red-500` to `from-success via-warning to-error`.
- Light-mode fallback pairs dropped in `ModalThumbnails.vue`, `LighthouseThreeD.vue`, `error.vue` (project is `ssr: false` + `colorMode: 'dark'`).
- Tooltip switched from `bg-gray-900/99` to `.glass-elevated`.
- `ResultsTableHead.vue` sort-button styling moved to primary-tinted glass.
- `ResultsRoute.vue` odd/even teal stripes replaced with hover + `border-b border-default`.
- Empty `components/MetricGuage.vue` deleted; orphan `.guage__*` CSS stripped from `main.css`.
- `design-guidelines.md` updated: removed stale Deferred Work entries (token cleanup + gauge), added `## Design Decisions` section capturing the 3 confirmed aesthetic choices and the dark-only/social-preview exceptions.

## Verification
- Grep baseline after changes: 200 → 21 Tailwind-color occurrences. The remaining 21 are all in `seo.vue` social-platform preview cards (Google/X/Facebook/LinkedIn/Slack/Discord) and brand icons — intentional platform mimicry, documented as an exception in the guidelines.
- Dev server boots on port 3000, no build errors.
- dev-browser sanity check on `/` and `/onboarding` (desktop 1280, mobile 375): `hasContent: true`, `hasNuxtError: false`, `mobileOverflows: false`, 0 console errors, 0 page errors.
- Screenshots captured in `~/.dev-browser/tmp/polish-{home,onboarding}-{desktop,mobile}`.
- Browser check: PASS.

## Not verified
- `/results/[scanId]/*` routes need a real scanId to render meaningfully. Visual verification of performance/accessibility/best-practices/seo pages deferred to a real scan run.
