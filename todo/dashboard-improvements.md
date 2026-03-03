# Dashboard Improvements

Tasks organized for parallel subagent execution. Each task is independent and can run concurrently.

---

## Task 1: Overview Page Fixes

**Status:** ✅ Complete
**Dependencies:** None
**Parallelizable:** Yes

### Issues (All Fixed)

1. **Screenshots** - Fixed: Shows placeholder for historical scans, actual screenshot when `artifactUrl` exists
2. **Sorting/filtering** - Fixed: Sort by path/score/category, quick filters (Worst 5, Best 5, Below 50)
3. **Summary section** - Fixed: Added `DashboardDashboardHeader` with aggregate stats
4. **Fuzzy search** - Fixed: Replaced with fuse.js

### Files to Modify

- `packages/ui/pages/results/[scanId]/index.vue` - Main overview page

### Current Code Analysis

**Screenshot issue (line 137-143):**
```vue
<img
  v-if="report.report"
  :src="resolveArtifactPath(report, 'screenshot.jpeg')"
  ...
>
```
- Check `resolveArtifactPath()` in `composables/unlighthouse.ts`
- Verify screenshot path resolution for both live and historical scans

**Search (line 51-57):**
```ts
const searchResults = computed((): any[] => {
  let data: any[] = reports.value || []
  if (searchText.value) {
    const term = searchText.value.toLowerCase()
    data = data.filter((r: any) => r.route?.path?.toLowerCase().includes(term) ...
```
- Replace with fuse.js: `npm install fuse.js`
- Configure keys: `['route.path', 'route.url']`

### Implementation

1. **Add summary header** - Use `DashboardDashboardHeader` component like other pages
2. **Add sort dropdown** - Sort by: overall score, performance, accessibility, etc.
3. **Add quick filters** - "Worst 5", "Best 5", "Below 50"
4. **Install fuse.js** - Replace string matching with fuzzy search
5. **Debug screenshots** - Check `resolveArtifactPath` returns valid URLs

### Reference Components

- `packages/ui/components/Dashboard/DashboardHeader.vue` - For summary stats
- Category pages already have sorting implemented

---

## Task 2: Accordion/Expand Fix

**Status:** 🔴 Needs implementation
**Dependencies:** None
**Parallelizable:** Yes

### Issue

Accordions throughout dashboard pages won't open/expand.

### Affected Pages

- `packages/ui/pages/results/[scanId]/accessibility.vue` - Issues accordion (line 114-145)
- `packages/ui/pages/results/[scanId]/seo.vue` - Duplicates accordion (line 211-239)

### Current Implementation

Accessibility uses manual toggle with `Set`:
```ts
const expandedIssues = ref<Set<string>>(new Set())
function toggleIssue(id: string) {
  if (expandedIssues.value.has(id)) expandedIssues.value.delete(id)
  else expandedIssues.value.add(id)
}
```

SEO uses same pattern:
```ts
const expandedItems = ref<Set<string>>(new Set())
function toggleItem(id: string) { ... }
```

### Investigation Steps

1. Check if click events fire (add console.log)
2. Check if `expandedIssues.has()` returns correct value
3. Check if `v-if="expandedIssues.has(issue.auditId)"` reactivity works
4. Test with Nuxt UI `UAccordion` component instead

### Likely Fix

Vue reactivity issue with `Set`. Either:
- Use `reactive(new Set())` instead of `ref(new Set())`
- Or switch to object-based tracking: `const expanded = ref<Record<string, boolean>>({})`

### Files to Modify

- `packages/ui/pages/results/[scanId]/accessibility.vue`
- `packages/ui/pages/results/[scanId]/seo.vue`
- `packages/ui/pages/results/[scanId]/performance.vue` (if applicable)
- `packages/ui/pages/results/[scanId]/best-practices.vue` (if applicable)

---

## Task 3: Performance Page Enhancements

**Status:** ✅ Complete
**Dependencies:** None
**Parallelizable:** Yes

### Issues

1. **No Web Vitals page** - ✅ Added dedicated "Web Vitals" tab with Core Web Vitals (LCP, CLS, TBT) and other metrics (FCP, SI, TTFB)
2. **No CrUX data** - Skipped (CrUX field data not available in current schema)
3. **Images from LCP** - ✅ Enhanced LCP Elements tab with element type icons and better visualization
4. **Network guidance** - Skipped (no aggregated network data in schema)

### Reference Code

**CrUX visualization:**
- `/home/harlan/pkg/llmwise/packages/ui/layers/crux` - CrUX dashboard example
- `packages/client/components/Crux/Graph` - Graph components

**LCP with images:**
- `packages/client/components/Cell/CellLargestContentfulPaint.vue`
- Shows clickable image outline when LCP is an image
- Uses `CellImageOutline` component

**Network requests:**
- `packages/client/components/Cell/CellNetworkRequests.vue`

### Files to Modify

- `packages/ui/pages/results/[scanId]/performance.vue`
- May need new components in `packages/ui/components/Dashboard/`

### Implementation

1. **Add "Web Vitals" tab** to performance page tabs array
2. **Create CrUX visualization** if CrUX data available in scan results
3. **Enhance LCP Elements tab:**
   - Show actual images for image-based LCP
   - Add image preview modal like old client
4. **Add network analysis section:**
   - Total request count
   - Request by type breakdown
   - Large requests list

### Data Requirements

Check what data is available in `PerformanceData` type (`composables/dashboard.ts:12-44`):
- `lcpElements` has `selector`, `elementType`, `avgLcp`
- May need to enhance backend to include image URLs

### Completed Implementation

1. **Web Vitals tab** - New first tab showing:
   - Core Web Vitals card (LCP, CLS, TBT) with color-coded ratings
   - Other Performance Metrics card (FCP, SI, TTFB) with color-coded ratings
   - Thresholds based on Google's Core Web Vitals guidelines
   - Visual indicators: good (green), needs improvement (amber), poor (red)

2. **Enhanced LCP Elements tab** - Changed from table to card layout:
   - Element type icons (photo for image, video-camera for video, document-text for text)
   - Color-coded by LCP performance
   - Type badges with distinct colors
   - Expandable pages list using existing DashboardPagesList component

3. **Files modified:**
   - `packages/ui/pages/results/[scanId]/performance.vue`

---

## Task 4: Accessibility Page Enhancements

**Status:** 🔴 Needs implementation
**Dependencies:** Task 2 (accordion fix)
**Parallelizable:** Partially (can start after accordion understanding)

### Issues

1. **Elements tab needs accordion** - Should expand to show linked pages
2. **Screenshots for issues** - Show visual context where available
3. **Color contrast visualization** - Show actual color swatches

### Reference Code

**Color contrast:**
- `packages/client/components/Cell/CellColorContrast.vue`
- Extracts fg/bg colors from `node.explanation`
- Shows colored text sample with actual colors

```vue
<div
  :style="{
    color: extractFgColor(node.explanation),
    backgroundColor: extractBgColor(node.explanation),
  }"
>
  {{ node.nodeLabel }}
</div>
```

**Layout shift screenshots:**
- `packages/client/components/Cell/CellLayoutShift.vue`
- Uses `CellImageOutline` for visual representation

### Files to Modify

- `packages/ui/pages/results/[scanId]/accessibility.vue`
- May need: `packages/ui/components/Dashboard/ColorContrastPreview.vue` (new)
- May need: `packages/ui/components/Dashboard/ElementScreenshot.vue` (new)

### Implementation

1. **Elements tab (line 150-170):**
   - Add accordion expand for each element
   - Show pages list on expand (already has `DashboardPagesList`)

2. **Color contrast issues:**
   - Detect color contrast audits in issues
   - Extract colors using helper functions
   - Render colored preview boxes

3. **Screenshot integration:**
   - For element-specific issues, show cropped screenshot if available
   - Need to check if screenshot data includes element coordinates

### Helper Functions Needed

```ts
// Extract from lighthouse explanation text like "foreground color: #333, background color: #fff"
function extractFgColor(explanation: string): string
function extractBgColor(explanation: string): string
```

---

## Task 5: SEO Page Enhancements

**Status:** ✅ Complete
**Dependencies:** None
**Parallelizable:** Yes

### Issues (All Fixed)

1. **Meta Overview empty** - Fixed: HTML data was not being passed to `processScanData`
2. **No SERP preview** - Fixed: Added Google-style SERP preview in expanded row

### Root Cause Analysis

The SEO meta data was extracted during the scan in `inspectHtmlTask` and stored in `routeReport.seo`, but when `processScanData` was called from the `worker-finished` hook, the `htmlData` parameter was undefined. The SEO processor relies on this data to populate the `seo_meta` table.

### Changes Made

1. **`packages/core/src/data/history/tracking.ts`**
   - Added `htmlDataMap` to collect HTML/SEO data during scan
   - Collect SEO data when `inspectHtmlTask` completes
   - Pass `htmlDataMap` to `processScanData` when worker finishes

2. **`packages/core/src/router/dashboard.ts`**
   - Fixed API response mapping for SEO endpoint
   - Map `metaDescription` to `description` (frontend expects this)
   - Compute `hasOgTags` from og:title/description/image presence
   - Compute `hasTwitterTags` from twitter card fields

3. **`packages/ui/pages/results/[scanId]/seo.vue`**
   - Added Google SERP preview in expanded meta row
   - Shows title (blue link), URL breadcrumb, description
   - Added character length progress bars for title/description
   - Visual indicators for optimal ranges (title: 30-60, description: 120-160)

### Implementation Notes

The SERP preview is styled to match Google's search result appearance:
- White background card
- Blue title link (#1a0dab)
- Gray URL breadcrumb format (domain.com > path > segment)
- Dark gray description (#4d5156)

Character length indicators use traffic light colors:
- Green: Within optimal range
- Amber: Slightly outside range
- Red: Too short/missing

---

## Subagent Execution Plan

```
┌─────────────────────────────────────────────────────────┐
│                    PARALLEL EXECUTION                    │
├─────────────────┬─────────────────┬─────────────────────┤
│    Agent 1      │    Agent 2      │      Agent 3        │
│  Overview Page  │  Accordion Fix  │  Performance Page   │
│                 │                 │                     │
│ - Screenshots   │ - Debug toggle  │ - Web Vitals tab    │
│ - Sorting       │ - Fix reactivity│ - LCP images        │
│ - Summary       │ - Test all pages│ - Network analysis  │
│ - Fuse.js       │                 │                     │
├─────────────────┴─────────────────┴─────────────────────┤
│                   AFTER ACCORDION FIX                    │
├─────────────────────────┬───────────────────────────────┤
│        Agent 4          │          Agent 5              │
│   Accessibility Page    │        SEO Page               │
│                         │                               │
│ - Element accordions    │ - Debug meta collection       │
│ - Color contrast viz    │ - SERP preview component      │
│ - Issue screenshots     │ - Fix data pipeline           │
└─────────────────────────┴───────────────────────────────┘
```

### Agent Instructions

Each agent should:
1. Read all files listed in their task
2. Implement minimal fixes (no over-engineering)
3. Test changes work in browser
4. Update this document with status + findings

### Shared Resources

- `packages/ui/composables/dashboard.ts` - Data fetching
- `packages/ui/components/Dashboard/` - Shared components
- `packages/client/components/Cell/` - Reference implementations from old client


--- 


NEW FEEDBACK ITEMS

## All

- [ ] No summary section

## Performance

- boxes need vertical spacing (using gap if this is a grid)
- Web Vitals, we want to show them that this is on the spectrum of good / needs improvement / poor so we need a bar with where they are or something (using frontend design to make something nice there)
- still no image data? is it available?

## Accessibility

- [ ] Accordions still dont work on issues
- [ ] No screenshots anywhere
- [ ] Missing alt images not loading

## Best Practices

- [ ] Console Errors accordion still not working

## SEO

- [ ] SERP preview should work like /home/harlan/sites/nuxtseo.com/layers/tools/app/pages/tools/social-share-debugger.vue
