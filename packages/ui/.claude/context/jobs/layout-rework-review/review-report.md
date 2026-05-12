---
verdict: FAIL
failed_criteria: [theme-consistency, color-mode-toggle]
failed_files:
  - components/DashboardShell.vue:10
  - pages/index.vue:295
  - layouts/dashboard.vue:32
categories: [theme-incoherence, broken-feature, color-contrast]
---

## FAIL — 2026-04-20

Layout structure matches pro-dashboard pattern (fixed sidebar, content area, mobile drawer). However, the implementation force-applies a `dark` class via `useHead` from inside the layout, which conflicts with Nuxt UI's color-mode module and does not apply to pages that don't use the layout. Result: inconsistent themes across routes and a broken color-mode toggle.

### Contract Scorecard (no contract; graded against the user's stated goal: "rework layout to match pro-dashboard")

✅ PASS [shell-structure]: Fixed-width sidebar + content + mobile drawer mirrors `ProDashboardShell.vue`. Sidebar slots for primary nav, categories, site card, history. Logo, footer, color-mode toggle present.
✅ PASS [nav-list]: `NavList.vue` mirrors `ProNavList` behavior (active-prefix styling, icon tile, badge slot).
✅ PASS [page-coverage]: history + 5 results routes wired to `layout: 'dashboard'`. Onboarding/scan correctly layout-less.
✅ PASS [semantic-tokens]: New layout + shell + history page migrated to `bg-default`, `text-muted`, `text-dimmed`, `text-highlighted`, `bg-elevated`, `border-default`, `text-primary`. No raw hex in new files.
✅ PASS [responsive]: No overflow at 375/768/1280px. Sidebar hides at <lg, hamburger menu appears, drawer opens correctly.
✅ PASS [no-console-errors]: Zero pageerrors, zero `console.error` on history route.
❌ FAIL [theme-consistency]: `useHead({ htmlAttrs: { class: 'dark' } })` in `DashboardShell.vue:10` forces dark only on pages using the layout. Onboarding/scan pages render in light mode. Navigating from /history (dark) → /onboarding (light) flips theme.
❌ FAIL [color-mode-toggle]: Clicking the `UColorModeButton` in the sidebar footer does nothing perceptible (label shows "Switch to dark mode" while dark class is already applied). Because `useHead` pins `class="dark"` at the layout level and `color-mode` writes `class="light"`, `document.documentElement.className` ends up as `"light dark"`. Toggling strips `dark` but the forced `useHead` reapplies on every navigation, leaving UI in a half-state.
⚠️ PARTIAL [contrast]: 6 axe-core `color-contrast` violations at `text-dimmed` + 11-12px size (ratio 3.78:1, expected 4.5:1). Reference `pro-dashboard.vue` uses the same tokens, so this matches intent, but strict AA still fails.

### Issues

#### [HARD REJECT] theme-incoherence: Layout force-applies dark class via useHead
- **File**: `components/DashboardShell.vue:10`
- **Evidence**: `useHead({ htmlAttrs: { class: 'dark' } })` conflicts with `@nuxt/ui` color-mode. `document.documentElement.className` = `"light dark"` on /history; = `"light"` on /onboarding. Onboarding screenshot shows fully light-themed page with white background while history renders dark. Users will see the theme flip on every navigation into/out of the dashboard layout.
- **Fix direction**: remove the useHead call. Set the app-wide preference in `nuxt.config.ts`:
  ```ts
  colorMode: { preference: 'dark', fallback: 'dark' }
  ```
  and let Nuxt UI's color-mode handle the class. Or set `useColorMode().preference = 'dark'` in a plugin.

#### [HARD REJECT] broken-feature: Color mode toggle button does not toggle theme reliably
- **File**: `components/DashboardShell.vue:45` (UColorModeButton in footer)
- **Evidence**: Button aria-label reads "Switch to dark mode" when the page is already visually dark. After clicking, html class becomes `"light"` (loses dark) but `useHead` in the layout will restore `"dark"` on the next hydration/navigation — user intent lost.
- **Fix direction**: remove the forced `useHead`, as above.

#### [RUBRIC] leftover-token: hardcoded gray color in local helper
- **File**: `pages/index.vue:295`
- **Evidence**: `return 'bg-gray-500/10'` in the file-local `getScoreBg`. Duplicate of the helper in `composables/dashboard.ts` which I migrated to `bg-elevated/60`. The page's local copy was missed. Should be removed and imported from the composable (already imported in other pages), or at minimum updated to `bg-elevated/60`.

#### [RUBRIC] theme-token-inconsistency: light-theme tokens in results pages
- **Files**: `pages/onboarding.vue:233,254,283,294,330,368,387`; `pages/results/[scanId]/scan.vue:303`; `pages/results/[scanId]/seo.vue:634`
- **Evidence**: `text-gray-200 / text-gray-300` for form labels and status text. Was in pre-existing code; not introduced by this rework. These happen to be readable on dark bg but skip the semantic-token migration done elsewhere. Minor; flag only because the user asked for consistent theme alignment.

#### [RUBRIC] pre-existing auto-import mismatches (exposed, not caused)
- **Files**: `pages/index.vue:599` (`<LoadingSkeletonScanCard>`), `components/Dashboard/IssueRow.vue:30,35` (`<DashboardSeverityBadge>`, `<DashboardPagesList>`)
- **Evidence**: `nuxt.config.ts` sets `components.pathPrefix: false`, so auto-generated names are filename-only: `SkeletonScanCard`, `SeverityBadge`, `PagesList`. These call sites use the directory-prefixed names and silently fail to resolve (Vue warns, element renders as nothing). Pre-existing in HEAD — not introduced by the rework — but `<DashboardSeverityBadge>`/`<DashboardPagesList>` is why accessibility-page issue rows will look broken. Worth fixing in the same session.

#### [RUBRIC] loose typing in layout
- **File**: `layouts/dashboard.vue:13`
- **Evidence**: `ref<{ site: string, device: string, routes: any[] } | null>` — `any[]` could be typed (it's the historical scan routes shape already defined elsewhere). Minor.

### What was verified
- Dev server boots without build errors (pnpm dev on port 3000).
- `curl http://localhost:3000/history` returns valid Nuxt HTML, no `nuxt-error` div.
- Dev-browser navigation to /history, /onboarding, /results/does-not-exist — all render.
- Screenshots captured at desktop (1280) and mobile (375).
- Mobile drawer opens via hamburger, shows primary nav.
- No horizontal overflow at 375/768/1280 widths.
- Console errors: 0. Page errors: 0. Vue warnings: 1 pre-existing (LoadingSkeletonScanCard).
- axe-core color-contrast scan: 6 serious violations (all `text-dimmed` on `bg-default`).
- Onboarding confirmed layout-less (sidebar count = 0).
- Component auto-import registry checked in `.nuxt/components.d.ts`.

### Next Steps

1. In `nuxt.config.ts`, add `colorMode: { preference: 'dark', fallback: 'dark' }` (requires `@nuxtjs/color-mode` — comes bundled with @nuxt/ui).
2. Delete `useHead({ htmlAttrs: { class: 'dark' } })` from `components/DashboardShell.vue:10`.
3. Re-verify `/onboarding` and `/history` both render dark, and the `UColorModeButton` toggles between light and dark cleanly.
4. In `pages/index.vue`, delete the local `getScoreColor`/`getScoreBg` helpers (lines ~281-300) and use the imported ones from `composables/dashboard.ts` (already imported at line 13).
5. Optional: fix pre-existing auto-import names (`<LoadingSkeletonScanCard>` → `<SkeletonScanCard>`, `<DashboardSeverityBadge>` → `<SeverityBadge>`, `<DashboardPagesList>` → `<PagesList>`). Would restore the scan-history loading skeleton and severity badges on accessibility page.
6. Contrast: if strict AA matters for this internal tool, bump `--ui-color-neutral-500` or swap `text-dimmed` → `text-muted` on sub-14px text. Otherwise accept (matches reference).

### Decision Log

- **Shell structure vs. reference**: spot-checked `ProDashboardShell.vue` side-by-side. Layout primitives (fixed aside, ml-64 content, UDrawer) are faithful. PASS.
- **Mobile drawer**: fallback slot pattern (`<slot name="mobile"><slot name="sidebar"/></slot>`) matches pro-dashboard. Verified by clicking hamburger, drawer opened with primary nav. PASS.
- **Auto-import name bug**: layout initially used `<DashboardSidebarHistory>` which didn't resolve (components.d.ts registers as `SidebarHistory`). Caught during first-pass verification (drawer showed only 2 links). Fixed mid-review. Re-verified: "Recent scans" + "No scans yet" render. PASS after fix.
- **Theme forcing**: initially looked harmless since history renders dark. Investigating the color-mode toggle behavior revealed the `light dark` class state. Then verifying `/onboarding` separately revealed the light-themed page. Classified as HARD REJECT because navigation between pages flips themes — a visible user-facing bug, not theoretical.
- **Contrast**: weighed reference-matching vs. strict AA. Classified PARTIAL (RUBRIC) not HARD because the pro-dashboard source uses these exact tokens — it is a project-wide design token choice, not a layout-level bug.
- **Pre-existing component name bugs**: verified in `git show HEAD:pages/index.vue` and `components/Dashboard/IssueRow.vue`. Not introduced by rework. Flagged as RUBRIC advisory since the session is already in a clean-up pass.
