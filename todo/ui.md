# Dashboard UI Implementation Plan

## Overview

Create four dashboard pages for viewing detailed scan results by category. Each dashboard consumes data from the new `/api/dashboard/*` endpoints.

## Tech Stack

- **Framework**: Nuxt 4 (already configured in `packages/ui`)
- **UI Components**: Nuxt UI v4 (`@nuxt/ui`)
- **Data Fetching**: `useFetch` or `$fetch`
- **State**: Composables in `packages/ui/composables/`

## Routes to Create

All pages go in `packages/ui/pages/`:

```
pages/
  results/
    performance.vue
    accessibility.vue
    best-practices.vue
    seo.vue
```

## API Endpoints Available

Base: `/api/dashboard/`

| Endpoint | Returns |
|----------|---------|
| `GET /summary/:scanId` | Computed summaries for all categories |
| `GET /performance/:scanId` | issues, thirdParty, lcpElements, routes |
| `GET /accessibility/:scanId` | issues, elements, missingAltImages, routes |
| `GET /best-practices/:scanId` | securityIssues, libraries, vulnerableLibraries, deprecatedApis, consoleErrors, routes |
| `GET /seo/:scanId` | meta, duplicates, canonicalChains, linkTextIssues, tapTargetIssues, routes |

## Shared Components Needed

Create in `packages/ui/components/Dashboard/`:

### DashboardHeader.vue
- Category title + icon
- Summary stats row (total issues, pages affected, etc.)
- Link back to main results

### DashboardCard.vue
- Reusable card wrapper with title, optional badge count
- Expandable/collapsible content

### IssueTable.vue
- Sortable table for issue lists
- Columns: issue, severity, pages affected, details
- Click row to expand affected pages

### PagesList.vue
- Expandable list of affected pages for an issue
- Shows path, links to route detail

### SeverityBadge.vue
- Color-coded badge: critical (red), serious (orange), moderate (yellow), minor (gray)

### ScoreGauge.vue
- Small circular score indicator (0-100)
- Already may exist, reuse if available

---

## Page Specifications

### 1. Performance Dashboard (`/results/performance`)

**Data**: `GET /api/dashboard/performance/:scanId`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Performance Dashboard                               │
│ Avg LCP: 2.4s | Avg CLS: 0.12 | Avg TBT: 340ms     │
├─────────────────────────────────────────────────────┤
│ [Tab: Images] [Tab: Third-Party] [Tab: LCP]        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Images Tab:                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ URL          │ Wasted │ Pages │ Issues      │   │
│  │ /hero.png    │ 450KB  │ 12    │ resize,lazy │   │
│  │ /logo.svg    │ 120KB  │ 45    │ format      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Third-Party Tab:                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ Entity       │ Avg TBT │ Total TBT │ Pages  │   │
│  │ Google Ads   │ 120ms   │ 1.4s      │ 12     │   │
│  │ Facebook     │ 80ms    │ 960ms     │ 12     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  LCP Elements Tab:                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ Selector          │ Type  │ Avg LCP │ Pages │   │
│  │ img.hero-image    │ image │ 2.8s    │ 8     │   │
│  │ h1.page-title     │ text  │ 1.2s    │ 4     │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key Features**:
- Sort images by wasted bytes (default)
- Filter by issue type (resize, lazy, format)
- Show total potential savings in header
- Link image URLs to external view

---

### 2. Accessibility Dashboard (`/results/accessibility`)

**Data**: `GET /api/dashboard/accessibility/:scanId`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Accessibility Dashboard                             │
│ Critical: 3 | Serious: 8 | Moderate: 12 | Minor: 5 │
├─────────────────────────────────────────────────────┤
│ [Tab: Issues] [Tab: Elements] [Tab: Images]        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Issues Tab (grouped by audit):                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ ● image-alt          │ Critical │ WCAG 1.1.1│   │
│  │   12 instances on 8 pages                   │   │
│  │   [Expand to see pages]                     │   │
│  ├─────────────────────────────────────────────┤   │
│  │ ● color-contrast     │ Serious  │ WCAG 1.4.3│   │
│  │   45 instances on 15 pages                  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Elements Tab (systemic issues):                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ Selector              │ Issue    │ Pages    │   │
│  │ .nav-link             │ contrast │ 23       │   │
│  │   FG: #777 BG: #fff Ratio: 4.2:1 (need 4.5) │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Missing Alt Images Tab:                            │
│  ┌─────────────────────────────────────────────┐   │
│  │ [thumb] /images/icon.svg  │ Decorative? │ 12│   │
│  │ [thumb] /images/hero.jpg  │ No          │ 1 │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key Features**:
- Group issues by severity (default sort)
- Show WCAG criteria with links to spec
- Color contrast preview (show actual colors)
- Decorative image suggestions
- Filter by WCAG level (A, AA)

---

### 3. Best Practices Dashboard (`/results/best-practices`)

**Data**: `GET /api/dashboard/best-practices/:scanId`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Best Practices Dashboard                            │
│ Security: 2 | Errors: 15 | Deprecated: 3           │
├─────────────────────────────────────────────────────┤
│ [Tab: Security] [Tab: Errors] [Tab: Libraries]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Security Tab:                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ ⚠ Mixed Content           │ High   │ 3 pages│   │
│  │   HTTP resources on HTTPS page              │   │
│  ├─────────────────────────────────────────────┤   │
│  │ ⚠ Unsafe Links            │ Medium │ 8 pages│   │
│  │   External links missing rel="noopener"     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Console Errors Tab:                                │
│  ┌─────────────────────────────────────────────┐   │
│  │ Source  │ Message              │ Count│Pages│   │
│  │ App     │ TypeError: undefined │ 45   │ 12  │   │
│  │ Network │ Failed to load...    │ 12   │ 8   │   │
│  │ 3rdPty  │ GTM error...         │ 8    │ 8   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Libraries Tab:                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Name     │ Version │ Status      │ Pages   │   │
│  │ React    │ 18.2.0  │ ✓ Current   │ 45      │   │
│  │ lodash   │ 4.17.15 │ ⚠ Outdated  │ 45      │   │
│  │ jQuery   │ 2.1.4   │ ✗ Vulnerable│ 12      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Deprecated APIs Tab:                               │
│  ┌─────────────────────────────────────────────┐   │
│  │ API                │ Source      │ Pages   │   │
│  │ document.write     │ analytics.js│ 12      │   │
│  │ AppCache           │ app.js      │ 1       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key Features**:
- Group errors by source type (app, network, third-party)
- Show normalized error messages (deduplicated)
- Library vulnerability details with CVE links
- Expandable stack traces for errors

---

### 4. SEO Dashboard (`/results/seo`)

**Data**: `GET /api/dashboard/seo/:scanId`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ SEO Dashboard                                       │
│ Pages: 45 | With Title: 44 | Indexable: 40         │
├─────────────────────────────────────────────────────┤
│ [Tab: Meta] [Tab: Duplicates] [Tab: Issues]        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Meta Overview Tab:                                 │
│  ┌─────────────────────────────────────────────┐   │
│  │ Path    │Title│Desc│Canon│OG│Twitter│Schema │   │
│  │ /       │ ✓   │ ✓  │ ✓   │✓ │ ✓     │ ✓     │   │
│  │ /about  │ ✓   │ ✗  │ ✓   │✗ │ ✗     │ ✗     │   │
│  │ /blog   │ ✓   │ ✓  │ ✗   │✓ │ ✓     │ ✓     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Duplicates Tab:                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ Type        │ Value              │ Pages    │   │
│  │ Title       │ "Welcome to..."    │ 3        │   │
│  │             │ [/page1, /page2, /page3]      │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Description │ "Default desc..."  │ 5        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Issues Tab:                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Canonical Chains:                           │   │
│  │   /old → /new → /final (chain)              │   │
│  │   /a → /b → /a (loop!) ⚠                    │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Generic Link Text:                          │   │
│  │   "click here" - 45 instances on 12 pages   │   │
│  │   "read more" - 23 instances on 8 pages     │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Tap Target Issues:                          │   │
│  │   /mobile-page - 3 elements too small       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key Features**:
- Meta checklist view (quick visual of what's missing)
- Click row to see full meta details
- Duplicate grouping with affected pages
- Canonical chain visualization
- Title/description length indicators (green/yellow/red)

---

## Composables to Create

### `useDashboard.ts`

```ts
export function useDashboard(scanId: string) {
  const summary = useFetch(`/api/dashboard/summary/${scanId}`)

  const performance = useLazyFetch(`/api/dashboard/performance/${scanId}`)
  const accessibility = useLazyFetch(`/api/dashboard/accessibility/${scanId}`)
  const bestPractices = useLazyFetch(`/api/dashboard/best-practices/${scanId}`)
  const seo = useLazyFetch(`/api/dashboard/seo/${scanId}`)

  return { summary, performance, accessibility, bestPractices, seo }
}
```

---

## Navigation

Add dashboard links to existing results page. In `packages/ui/pages/scan.vue` or results area, add:

```vue
<UTabs :items="[
  { label: 'Overview', to: '/results' },
  { label: 'Performance', to: '/results/performance' },
  { label: 'Accessibility', to: '/results/accessibility' },
  { label: 'Best Practices', to: '/results/best-practices' },
  { label: 'SEO', to: '/results/seo' },
]"
/>
```

---

## Implementation Order

1. **Shared components first**: DashboardCard, IssueTable, SeverityBadge, PagesList
2. **Performance dashboard**: Simplest data structure, good test case
3. **Accessibility dashboard**: Builds on patterns from performance
4. **SEO dashboard**: Most complex with meta overview
5. **Best Practices dashboard**: Multiple data sources
6. **Navigation integration**: Add tabs to existing UI

---

## Nuxt UI Components to Use

- `UTabs` - Category tabs within each dashboard
- `UTable` - Issue/route tables with sorting
- `UBadge` - Severity indicators
- `UCard` - Section containers
- `UAccordion` - Expandable issue details
- `UProgress` - Score bars
- `UTooltip` - Additional context
- `USkeleton` - Loading states
- `UAlert` - Empty states, warnings

---

## Notes

- All data already parsed (JSON fields pre-parsed in API response)
- Use `scanId` from route params or global state (`useScan()` composable)
- Handle empty states gracefully (no issues = success message)
- Mobile responsive: stack tables vertically on small screens
