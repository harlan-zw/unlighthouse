# Performance Dashboard

## Route
`/results/performance`

## Database Schema

Uses these tables from `packages/core/src/data/history/schema.ts`:

```typescript
// Core metrics per route
scanRoutes: {
  lcp: integer     // Largest Contentful Paint (ms)
  cls: integer     // Cumulative Layout Shift (x1000)
  tbt: integer     // Total Blocking Time (ms)
  fcp: integer     // First Contentful Paint (ms)
  si: integer      // Speed Index (ms)
  ttfb: integer    // Time to First Byte (ms)
  performanceScore: integer
}

// Aggregated issues (images, scripts, etc.)
performanceIssues: {
  type: 'image' | 'script' | 'stylesheet' | 'font' | 'render-blocking'
  url: text
  wastedBytes: integer
  wastedMs: integer
  pageCount: integer
  pages: JSON array
  issueSubtype: 'resize' | 'format' | 'lazy' | 'unused'
}

// Third-party script impact
thirdPartyScripts: {
  entity: text       // "Google Analytics"
  url: text
  avgTbt: integer
  totalTbt: integer
  pageCount: integer
  pages: JSON array
}

// LCP element grouping
lcpElements: {
  selector: text
  elementType: 'image' | 'text' | 'video'
  avgLcp: integer
  pageCount: integer
  pages: JSON array
}

// Cached summary
dashboardSummaries.performanceSummary: JSON
```

---

## Dashboard Layout

```
┌─ Summary ───────────────────────────────────────────────────────┐
│  [67] Average Score    │  23/45 passing Core Web Vitals         │
└─────────────────────────────────────────────────────────────────┘

┌─ Core Web Vitals ───────────────────────────────────────────────┐
│  LCP  2.4s avg   ████████░░ 36 good | 6 needs work | 3 poor    │
│  CLS  0.12 avg   ██████░░░░ 28 good | 12 needs work | 5 poor   │
│  TBT  450ms avg  ████░░░░░░ 18 good | 15 needs work | 12 poor  │
│  FCP  1.8s avg   ████████░░ 40 good | 4 needs work | 1 poor    │
└─────────────────────────────────────────────────────────────────┘

┌─ Top Opportunities ─────────────────────────────────────────────┐
│  🖼️ 12 images need optimization (save ~2.3MB) across 28 pages  │
│  📦 340KB unused JavaScript across 15 pages                     │
│  🚫 8 render-blocking resources on 22 pages                     │
└─────────────────────────────────────────────────────────────────┘

┌─ Problematic Images ────────────────────────────────────────────┐
│  /img/hero.jpg       1.2MB   15 pages   resize                  │
│  /img/banner.png     890KB   12 pages   format                  │
└─────────────────────────────────────────────────────────────────┘

┌─ Third-Party Impact ────────────────────────────────────────────┐
│  Google Analytics    45ms avg    45 pages                       │
│  Facebook Pixel     120ms avg    32 pages                       │
│  Intercom           280ms avg    28 pages                       │
└─────────────────────────────────────────────────────────────────┘

┌─ LCP Elements ──────────────────────────────────────────────────┐
│  <img class="hero-image">    18 pages   avg 3.2s                │
│  <h1 class="page-title">     12 pages   avg 2.1s                │
└─────────────────────────────────────────────────────────────────┘

┌─ Worst Pages ───────────────────────────────────────────────────┐
│  /products     32   LCP 5.2s   TBT 1.2s   CLS 0.32              │
│  /checkout     38   LCP 4.8s   TBT 890ms  CLS 0.45              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Queries

### Summary Stats

```typescript
// Average score and CWV pass rate
const summary = await db
  .select({
    avgScore: avg(scanRoutes.performanceScore),
    totalPages: count(),
    passingCwv: count(
      sql`CASE WHEN lcp <= 2500 AND cls <= 100 AND tbt <= 200 THEN 1 END`
    ),
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))
```

### Core Web Vitals Distribution

```typescript
// CWV metrics with thresholds
const cwvMetrics = await db
  .select({
    path: scanRoutes.path,
    lcp: scanRoutes.lcp,
    cls: scanRoutes.cls,
    tbt: scanRoutes.tbt,
    fcp: scanRoutes.fcp,
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))

// Compute distribution in JS
const lcpDistribution = {
  good: cwvMetrics.filter(r => r.lcp <= 2500).length,
  needsWork: cwvMetrics.filter(r => r.lcp > 2500 && r.lcp <= 4000).length,
  poor: cwvMetrics.filter(r => r.lcp > 4000).length,
  avg: cwvMetrics.reduce((a, r) => a + r.lcp, 0) / cwvMetrics.length,
  worst: cwvMetrics.sort((a, b) => b.lcp - a.lcp)[0],
}
```

### Opportunities (from performanceIssues)

```typescript
// Images needing optimization
const imageIssues = await db
  .select()
  .from(performanceIssues)
  .where(and(
    eq(performanceIssues.scanId, scanId),
    eq(performanceIssues.type, 'image')
  ))
  .orderBy(desc(performanceIssues.wastedBytes))

// Total savings
const totalImageSavings = imageIssues.reduce((a, i) => a + i.wastedBytes, 0)

// Render-blocking resources
const renderBlocking = await db
  .select()
  .from(performanceIssues)
  .where(and(
    eq(performanceIssues.scanId, scanId),
    eq(performanceIssues.type, 'render-blocking')
  ))
```

### Third-Party Scripts

```typescript
const thirdParty = await db
  .select()
  .from(thirdPartyScripts)
  .where(eq(thirdPartyScripts.scanId, scanId))
  .orderBy(desc(thirdPartyScripts.avgTbt))
```

### LCP Element Analysis

```typescript
const lcpGroups = await db
  .select()
  .from(lcpElements)
  .where(eq(lcpElements.scanId, scanId))
  .orderBy(desc(lcpElements.pageCount))
```

### Worst Pages

```typescript
const worstPages = await db
  .select({
    path: scanRoutes.path,
    score: scanRoutes.performanceScore,
    lcp: scanRoutes.lcp,
    tbt: scanRoutes.tbt,
    cls: scanRoutes.cls,
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))
  .orderBy(asc(scanRoutes.performanceScore))
  .limit(10)
```

---

## Data Extraction (on scan completion)

Extract from each route's LHR (`lhrGzip` decompressed):

```typescript
const PERF_AUDITS_TO_EXTRACT = {
  // Opportunities with items
  'uses-optimized-images': { type: 'image', subtype: 'format' },
  'uses-responsive-images': { type: 'image', subtype: 'resize' },
  'offscreen-images': { type: 'image', subtype: 'lazy' },
  'unused-javascript': { type: 'script', subtype: 'unused' },
  'unused-css-rules': { type: 'stylesheet', subtype: 'unused' },
  'render-blocking-resources': { type: 'render-blocking' },
  'font-display': { type: 'font' },

  // Third-party
  'third-party-summary': 'thirdPartyScripts',

  // LCP element
  'largest-contentful-paint-element': 'lcpElements',
}
```

### Aggregation Logic

```typescript
async function extractPerformanceData(scanId: string, routes: RouteWithLhr[]) {
  const issueMap = new Map<string, PerformanceIssue>()
  const thirdPartyMap = new Map<string, ThirdPartyScript>()
  const lcpMap = new Map<string, LcpElement>()

  for (const { path, lhr } of routes) {
    // Image opportunities
    for (const auditId of ['uses-optimized-images', 'uses-responsive-images', 'offscreen-images']) {
      const items = lhr.audits[auditId]?.details?.items || []
      for (const item of items) {
        const key = item.url
        const existing = issueMap.get(key) || {
          type: 'image',
          url: item.url,
          wastedBytes: 0,
          pages: [],
          issueSubtype: PERF_AUDITS_TO_EXTRACT[auditId].subtype,
        }
        existing.wastedBytes += item.wastedBytes || 0
        existing.pages.push(path)
        issueMap.set(key, existing)
      }
    }

    // Third-party scripts
    const thirdPartyItems = lhr.audits['third-party-summary']?.details?.items || []
    for (const item of thirdPartyItems) {
      const key = item.entity
      const existing = thirdPartyMap.get(key) || {
        entity: item.entity,
        url: item.url,
        totalTbt: 0,
        pages: [],
      }
      existing.totalTbt += item.blockingTime || 0
      existing.pages.push(path)
      thirdPartyMap.set(key, existing)
    }

    // LCP element
    const lcpItem = lhr.audits['largest-contentful-paint-element']?.details?.items?.[0]
    if (lcpItem) {
      const selector = lcpItem.node?.selector || 'unknown'
      const existing = lcpMap.get(selector) || {
        selector,
        elementType: lcpItem.node?.type || 'unknown',
        lcpValues: [],
        pages: [],
      }
      existing.lcpValues.push(lhr.audits['largest-contentful-paint']?.numericValue || 0)
      existing.pages.push(path)
      lcpMap.set(selector, existing)
    }
  }

  // Insert into DB
  await db.insert(performanceIssues).values(
    Array.from(issueMap.values()).map(i => ({
      scanId,
      ...i,
      pageCount: i.pages.length,
      pages: JSON.stringify(i.pages),
    }))
  )

  // ... similar for thirdPartyScripts and lcpElements
}
```

---

## Dashboard Summary JSON

Stored in `dashboardSummaries.performanceSummary`:

```typescript
interface PerformanceSummary {
  avgScore: number
  cwvPassRate: number
  cwvPassCount: number
  pageCount: number

  metrics: {
    lcp: { avg: number, good: number, needsWork: number, poor: number }
    cls: { avg: number, good: number, needsWork: number, poor: number }
    tbt: { avg: number, good: number, needsWork: number, poor: number }
    fcp: { avg: number, good: number, needsWork: number, poor: number }
  }

  opportunities: {
    images: { count: number, totalSavings: number, pagesAffected: number }
    unusedJs: { count: number, totalSavings: number, pagesAffected: number }
    renderBlocking: { count: number, pagesAffected: number }
  }

  thirdPartyTotalTbt: number
  thirdPartyCount: number
}
```

---

## CWV Thresholds Reference

| Metric | Good | Needs Work | Poor |
|--------|------|------------|------|
| LCP | ≤2500ms | ≤4000ms | >4000ms |
| CLS | ≤0.1 (100 in DB) | ≤0.25 (250) | >0.25 |
| TBT | ≤200ms | ≤600ms | >600ms |
| FCP | ≤1800ms | ≤3000ms | >3000ms |

Note: CLS stored as integer (x1000) so 0.1 = 100 in database.
