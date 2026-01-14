# Database Schema for Dashboard Features

## Overview

This schema supports:
- Category-specific dashboards (Performance, Accessibility, Best Practices, SEO)
- LHCI-style history comparisons and regression detection
- Aggregated issue tracking across pages
- Resource deduplication

## Current Schema (Existing)

```sql
-- scans: scan session metadata
-- scanRoutes: individual route scores
```

## Required Schema Extensions

### 1. Core Web Vitals Metrics (LHCI Integration)

Extend `scan_routes` with extracted metrics for comparison stability:

```ts
// packages/core/src/data/history/schema.ts

export const scanRoutes = sqliteTable('scan_routes', {
  // ... existing fields ...

  // Core Web Vitals (stable across LH versions)
  lcp: integer('lcp'), // Largest Contentful Paint (ms)
  cls: integer('cls'), // Cumulative Layout Shift (x1000 for int storage)
  tbt: integer('tbt'), // Total Blocking Time (ms)
  fcp: integer('fcp'), // First Contentful Paint (ms)
  si: integer('si'), // Speed Index (ms)
  ttfb: integer('ttfb'), // Time to First Byte (ms)

  // Raw LHR for deep dives (gzipped JSON)
  lhrGzip: blob('lhr_gzip'),
})
```

### 2. Performance Dashboard Data

New table for aggregated performance issues:

```ts
export const performanceIssues = sqliteTable('performance_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  // Issue identification
  type: text('type').notNull(), // 'image' | 'script' | 'stylesheet' | 'font' | 'render-blocking'
  url: text('url').notNull(), // Resource URL

  // Impact
  wastedBytes: integer('wasted_bytes'),
  wastedMs: integer('wasted_ms'),

  // Occurrence
  pageCount: integer('page_count').notNull().default(1),
  pages: text('pages'), // JSON array of paths

  // Details
  issueSubtype: text('issue_subtype'), // 'resize' | 'format' | 'lazy' | 'unused' etc
  details: text('details'), // JSON for issue-specific data
})

export const thirdPartyScripts = sqliteTable('third_party_scripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  entity: text('entity').notNull(), // "Google Analytics", "Facebook" etc
  url: text('url').notNull(),
  avgTbt: integer('avg_tbt'), // Average TBT contribution (ms)
  totalTbt: integer('total_tbt'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'), // JSON array
})

export const lcpElements = sqliteTable('lcp_elements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  selector: text('selector').notNull(),
  elementType: text('element_type'), // 'image' | 'text' | 'video'
  avgLcp: integer('avg_lcp'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})
```

### 3. Accessibility Dashboard Data

```ts
export const accessibilityIssues = sqliteTable('accessibility_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  // Issue type
  auditId: text('audit_id').notNull(), // 'color-contrast', 'image-alt', etc
  title: text('title').notNull(),
  severity: text('severity').notNull(), // 'critical' | 'serious' | 'moderate' | 'minor'

  // WCAG mapping
  wcagCriteria: text('wcag_criteria'), // JSON array: ['1.4.3', '1.4.6']
  wcagLevel: text('wcag_level'), // 'A' | 'AA' | 'AAA'

  // Aggregation
  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'), // JSON array
})

export const accessibilityElements = sqliteTable('accessibility_elements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  // Element identification
  selector: text('selector').notNull(),
  snippet: text('snippet'), // HTML snippet

  // Issue details
  auditId: text('audit_id').notNull(),
  severity: text('severity').notNull(),
  issueDescription: text('issue_description'),

  // For contrast issues
  foregroundColor: text('foreground_color'),
  backgroundColor: text('background_color'),
  contrastRatio: real('contrast_ratio'),
  requiredRatio: real('required_ratio'),

  // Occurrence across pages
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const missingAltImages = sqliteTable('missing_alt_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  url: text('url').notNull(),
  thumbnail: text('thumbnail'), // Path to thumbnail if available
  isDecorative: integer('is_decorative', { mode: 'boolean' }).default(false),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})
```

### 4. Best Practices Dashboard Data

```ts
export const securityIssues = sqliteTable('security_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'mixed-content' | 'unsafe-link' | 'csp' | 'hsts'
  severity: text('severity').notNull(), // 'critical' | 'high' | 'medium' | 'low'

  description: text('description'),
  details: text('details'), // JSON for type-specific data

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const detectedLibraries = sqliteTable('detected_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  version: text('version'),
  sourceFile: text('source_file'), // Where the library was found

  status: text('status').notNull(), // 'current' | 'outdated' | 'vulnerable' | 'deprecated'

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const vulnerableLibraries = sqliteTable('vulnerable_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  version: text('version').notNull(),
  severity: text('severity').notNull(), // 'critical' | 'high' | 'medium' | 'low'

  cves: text('cves'), // JSON array of CVE IDs
  description: text('description'),
  recommendation: text('recommendation'),
  sourceFile: text('source_file'),

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const deprecatedApis = sqliteTable('deprecated_apis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  api: text('api').notNull(),
  description: text('description'),
  alternative: text('alternative'),
  removalDate: text('removal_date'),

  isThirdParty: integer('is_third_party', { mode: 'boolean' }).default(false),
  sourceFile: text('source_file'),

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const consoleErrors = sqliteTable('console_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  message: text('message').notNull(),
  normalizedMessage: text('normalized_message'), // For grouping similar errors

  sourceType: text('source_type').notNull(), // 'app' | 'network' | 'csp' | 'thirdParty'
  sourceFile: text('source_file'),
  stackTrace: text('stack_trace'),

  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})
```

### 5. SEO Dashboard Data

```ts
export const seoMeta = sqliteTable('seo_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),
  routeId: integer('route_id').references(() => scanRoutes.id, { onDelete: 'cascade' }),

  path: text('path').notNull(),

  // Core meta
  title: text('title'),
  titleLength: integer('title_length'),
  metaDescription: text('meta_description'),
  metaDescriptionLength: integer('meta_description_length'),

  // Indexability
  isIndexable: integer('is_indexable', { mode: 'boolean' }).default(true),
  robotsDirective: text('robots_directive'), // 'index,follow', 'noindex', etc
  blockedByRobotsTxt: integer('blocked_by_robots_txt', { mode: 'boolean' }).default(false),

  // Canonical
  canonical: text('canonical'),
  canonicalType: text('canonical_type'), // 'self' | 'other' | 'missing'

  // Open Graph
  ogTitle: text('og_title'),
  ogDescription: text('og_description'),
  ogImage: text('og_image'),
  ogUrl: text('og_url'),

  // Twitter Cards
  twitterCard: text('twitter_card'),
  twitterTitle: text('twitter_title'),
  twitterDescription: text('twitter_description'),
  twitterImage: text('twitter_image'),

  // Structured Data
  hasStructuredData: integer('has_structured_data', { mode: 'boolean' }).default(false),
  structuredDataTypes: text('structured_data_types'), // JSON array: ['Product', 'Article']
  structuredDataValid: integer('structured_data_valid', { mode: 'boolean' }),
  structuredDataWarnings: text('structured_data_warnings'),

  // Hreflang
  hreflangTags: text('hreflang_tags'), // JSON array: [{lang, href}]
})

export const seoDuplicates = sqliteTable('seo_duplicates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'title' | 'meta_description'
  value: text('value').notNull(), // The duplicated value
  pageCount: integer('page_count').notNull(),
  pages: text('pages'), // JSON array
})

export const canonicalChains = sqliteTable('canonical_chains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  chainType: text('chain_type').notNull(), // 'chain' | 'loop'
  pages: text('pages').notNull(), // JSON array of pages in chain
  finalTarget: text('final_target'), // Where chain should point
})

export const linkTextIssues = sqliteTable('link_text_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  text: text('text').notNull(), // "Click here", "Read more"
  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const tapTargetIssues = sqliteTable('tap_target_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  path: text('path').notNull(),
  elementCount: integer('element_count').notNull(),
  elements: text('elements'), // JSON array of element details
})
```

### 6. History Comparison (LHCI-style)

```ts
export const comparisons = sqliteTable('comparisons', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  baseScanId: text('base_scan_id').references(() => scans.id, { onDelete: 'cascade' }),
  currentScanId: text('current_scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  // Summary
  improved: integer('improved').notNull().default(0),
  regressed: integer('regressed').notNull().default(0),
  unchanged: integer('unchanged').notNull().default(0),
  newUrls: integer('new_urls').notNull().default(0),
  removedUrls: integer('removed_urls').notNull().default(0),

  // Computed at
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const comparisonDiffs = sqliteTable('comparison_diffs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  comparisonId: integer('comparison_id').references(() => comparisons.id, { onDelete: 'cascade' }),

  path: text('path').notNull(),
  url: text('url').notNull(),

  // Metric changes (JSON array of {name, base, current, delta, severity})
  metricDiffs: text('metric_diffs').notNull(),

  // Overall change
  severity: text('severity').notNull(), // 'improvement' | 'regression' | 'neutral'
})

export const assertions = sqliteTable('assertions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'minScore' | 'maxNumericValue' | 'maxRegression'
  category: text('category'), // 'performance' | 'accessibility' etc
  metric: text('metric'), // 'lcp' | 'cls' etc
  value: real('value').notNull(),

  passed: integer('passed', { mode: 'boolean' }).notNull(),
  actual: real('actual').notNull(),

  failingRoutes: text('failing_routes'), // JSON array of {url, value}
})
```

### 7. Dashboard Summaries (Computed/Cached)

```ts
export const dashboardSummaries = sqliteTable('dashboard_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }).unique(),

  // Performance summary
  performanceSummary: text('performance_summary'), // JSON: PerformanceDashboardData

  // Accessibility summary
  accessibilitySummary: text('accessibility_summary'), // JSON: AccessibilityDashboardData

  // Best Practices summary
  bestPracticesSummary: text('best_practices_summary'), // JSON: BestPracticesDashboardData

  // SEO summary
  seoSummary: text('seo_summary'), // JSON: SeoDashboardData

  // Computed at
  computedAt: integer('computed_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Scan Execution                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Route discovered → scanRoutes (pending)                      │
│  2. Lighthouse runs → scanRoutes (scores + CWV metrics)         │
│  3. LHR stored → scanRoutes.lhrGzip                             │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Post-Scan Processing                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Extract metrics from all LHRs                               │
│  2. Aggregate issues by type                                    │
│  3. Deduplicate resources across pages                          │
│  4. Compute dashboard summaries                                 │
│  5. Store in category-specific tables                           │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard Load                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Load dashboardSummaries (fast JSON load)                    │
│  2. Query specific tables for drill-down                        │
│  3. Lazy-load LHR details when needed                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Processing

### Processing Architecture

```
packages/core/src/process/
├── index.ts                    # Main orchestrator
├── extract.ts                  # LHR metric extraction (LH version isolation)
├── performance.ts              # Performance aggregation
├── accessibility.ts            # Accessibility aggregation
├── best-practices.ts           # Best practices aggregation
├── seo.ts                      # SEO aggregation
├── comparison.ts               # History comparison engine
└── types.ts                    # Shared types
```

### When Processing Runs

```ts
// packages/core/src/unlighthouse.ts

// Option 1: Process on scan completion (recommended)
unlighthouse.hooks.hook('scan:complete', async (scan) => {
  await processScanData(scan.id)
})

// Option 2: Process incrementally per-route (for real-time dashboards)
unlighthouse.hooks.hook('route:complete', async (route) => {
  await processRouteData(route) // lightweight per-route extraction
})
unlighthouse.hooks.hook('scan:complete', async (scan) => {
  await aggregateScanData(scan.id) // final aggregation pass
})
```

### 1. LHR Extraction (Version-Isolated)

```ts
// packages/core/src/process/extract.ts
import { gunzipSync, gzipSync } from 'node:zlib'

interface ExtractedRoute {
  // CWV metrics
  lcp: number | null
  cls: number | null // stored as x1000 int
  tbt: number | null
  fcp: number | null
  si: number | null
  ttfb: number | null

  // Category scores (0-1)
  scores: {
    performance: number | null
    accessibility: number | null
    bestPractices: number | null
    seo: number | null
  }

  // Raw audits for aggregation
  audits: Record<string, AuditResult>

  // Compressed LHR
  lhrGzip: Buffer
}

// Audit ID mapping for LH version changes
const AUDIT_MAP: Record<string, Record<string, string>> = {
  12: {}, // v12 mappings
  13: {}, // v13 mappings if audit IDs change
}

export function extractRouteData(lhr: LighthouseResult): ExtractedRoute {
  const version = lhr.lighthouseVersion.split('.')[0]
  const mapAudit = (id: string) => AUDIT_MAP[version]?.[id] ?? id

  return {
    lcp: getNumeric(lhr, mapAudit('largest-contentful-paint')),
    cls: Math.round((getNumeric(lhr, mapAudit('cumulative-layout-shift')) ?? 0) * 1000),
    tbt: getNumeric(lhr, mapAudit('total-blocking-time')),
    fcp: getNumeric(lhr, mapAudit('first-contentful-paint')),
    si: getNumeric(lhr, mapAudit('speed-index')),
    ttfb: getNumeric(lhr, mapAudit('server-response-time')),
    scores: {
      performance: lhr.categories.performance?.score ?? null,
      accessibility: lhr.categories.accessibility?.score ?? null,
      bestPractices: lhr.categories['best-practices']?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
    },
    audits: lhr.audits,
    lhrGzip: gzipSync(JSON.stringify(lhr)),
  }
}

function getNumeric(lhr: LighthouseResult, auditId: string): number | null {
  return lhr.audits[auditId]?.numericValue ?? null
}
```

### 2. Performance Processing

```ts
// packages/core/src/process/performance.ts

interface PerformanceProcessor {
  scanId: string
  routes: Map<string, ExtractedRoute>
}

export async function processPerformance(p: PerformanceProcessor) {
  const { scanId, routes } = p

  // 1. Aggregate images across pages
  const imageMap = new Map<string, ImageIssue>()
  const imageAudits = ['uses-optimized-images', 'uses-responsive-images', 'offscreen-images']

  for (const [path, route] of routes) {
    for (const auditId of imageAudits) {
      const items = route.audits[auditId]?.details?.items ?? []
      for (const item of items) {
        const url = item.url
        const existing = imageMap.get(url) ?? {
          url,
          wastedBytes: 0,
          pages: [],
          issues: new Set<string>(),
        }
        existing.wastedBytes += item.wastedBytes ?? 0
        existing.pages.push(path)
        existing.issues.add(auditToIssueType(auditId))
        imageMap.set(url, existing)
      }
    }
  }

  // 2. Insert deduplicated issues
  const imageIssues = [...imageMap.values()].map(img => ({
    scanId,
    type: 'image',
    url: img.url,
    wastedBytes: img.wastedBytes,
    pageCount: img.pages.length,
    pages: JSON.stringify([...new Set(img.pages)]),
    issueSubtype: [...img.issues].join(','),
  }))

  await db.insert(performanceIssues).values(imageIssues)

  // 3. Third-party scripts
  const thirdPartyMap = new Map<string, ThirdPartyData>()
  for (const [path, route] of routes) {
    const items = route.audits['third-party-summary']?.details?.items ?? []
    for (const item of items) {
      const entity = item.entity
      const existing = thirdPartyMap.get(entity) ?? {
        entity,
        url: item.url,
        tbtSum: 0,
        pages: [],
      }
      existing.tbtSum += item.blockingTime ?? 0
      existing.pages.push(path)
      thirdPartyMap.set(entity, existing)
    }
  }

  const thirdParty = [...thirdPartyMap.values()].map(tp => ({
    scanId,
    entity: tp.entity,
    url: tp.url,
    avgTbt: Math.round(tp.tbtSum / tp.pages.length),
    totalTbt: Math.round(tp.tbtSum),
    pageCount: tp.pages.length,
    pages: JSON.stringify([...new Set(tp.pages)]),
  }))

  await db.insert(thirdPartyScripts).values(thirdParty)

  // 4. LCP elements
  const lcpMap = new Map<string, LcpData>()
  for (const [path, route] of routes) {
    const items = route.audits['largest-contentful-paint-element']?.details?.items ?? []
    const lcpItem = items[0]
    if (!lcpItem?.node?.selector)
      continue

    const selector = lcpItem.node.selector
    const existing = lcpMap.get(selector) ?? {
      selector,
      elementType: lcpItem.node.nodeLabel?.startsWith('<img') ? 'image' : 'text',
      lcpSum: 0,
      pages: [],
    }
    existing.lcpSum += route.lcp ?? 0
    existing.pages.push(path)
    lcpMap.set(selector, existing)
  }

  const lcpElements = [...lcpMap.values()].map(lcp => ({
    scanId,
    selector: lcp.selector,
    elementType: lcp.elementType,
    avgLcp: Math.round(lcp.lcpSum / lcp.pages.length),
    pageCount: lcp.pages.length,
    pages: JSON.stringify(lcp.pages),
  }))

  await db.insert(lcpElementsTable).values(lcpElements)

  // 5. Compute summary
  return computePerformanceSummary(routes)
}

function auditToIssueType(auditId: string): string {
  return ({
    'uses-optimized-images': 'format',
    'uses-responsive-images': 'resize',
    'offscreen-images': 'lazy',
  })[auditId] ?? 'unknown'
}
```

### 3. Accessibility Processing

```ts
// packages/core/src/process/accessibility.ts

const SEVERITY_MAP: Record<string, string> = {
  'image-alt': 'critical',
  'label': 'critical',
  'button-name': 'critical',
  'link-name': 'critical',
  'color-contrast': 'serious',
  'html-has-lang': 'serious',
  'heading-order': 'moderate',
  'tabindex': 'moderate',
  'duplicate-id-aria': 'minor',
}

const WCAG_MAP: Record<string, string[]> = {
  'image-alt': ['1.1.1'],
  'color-contrast': ['1.4.3'],
  'label': ['1.3.1', '4.1.2'],
  'html-has-lang': ['3.1.1'],
  // ... etc
}

export async function processAccessibility(p: ProcessorParams) {
  const { scanId, routes } = p

  // 1. Aggregate issues by audit type
  const issueMap = new Map<string, A11yIssue>()

  for (const [path, route] of routes) {
    for (const [auditId, audit] of Object.entries(route.audits)) {
      if (!SEVERITY_MAP[auditId])
        continue
      if (audit.score === 1)
        continue // passing

      const items = audit.details?.items ?? []
      const existing = issueMap.get(auditId) ?? {
        auditId,
        title: audit.title,
        severity: SEVERITY_MAP[auditId],
        wcagCriteria: WCAG_MAP[auditId] ?? [],
        instances: 0,
        pages: new Set<string>(),
      }
      existing.instances += items.length || 1
      existing.pages.add(path)
      issueMap.set(auditId, existing)
    }
  }

  await db.insert(accessibilityIssues).values(
    [...issueMap.values()].map(issue => ({
      scanId,
      auditId: issue.auditId,
      title: issue.title,
      severity: issue.severity,
      wcagCriteria: JSON.stringify(issue.wcagCriteria),
      wcagLevel: getWcagLevel(issue.wcagCriteria),
      instanceCount: issue.instances,
      pageCount: issue.pages.size,
      pages: JSON.stringify([...issue.pages]),
    }))
  )

  // 2. Deduplicate elements (find systemic issues)
  const elementMap = new Map<string, ElementIssue>()

  for (const [path, route] of routes) {
    for (const [auditId, audit] of Object.entries(route.audits)) {
      if (!SEVERITY_MAP[auditId] || audit.score === 1)
        continue

      const items = audit.details?.items ?? []
      for (const item of items) {
        const selector = item.node?.selector
        if (!selector)
          continue

        const key = `${auditId}:${selector}`
        const existing = elementMap.get(key) ?? {
          selector,
          snippet: item.node?.snippet,
          auditId,
          severity: SEVERITY_MAP[auditId],
          pages: new Set<string>(),
          // contrast-specific
          foreground: item.foregroundColor,
          background: item.backgroundColor,
          ratio: item.contrastRatio,
          required: item.expectedContrastRatio,
        }
        existing.pages.add(path)
        elementMap.set(key, existing)
      }
    }
  }

  // Only store elements appearing on 2+ pages (systemic issues)
  const systemicElements = [...elementMap.values()]
    .filter(el => el.pages.size > 1)
    .map(el => ({
      scanId,
      selector: el.selector,
      snippet: el.snippet,
      auditId: el.auditId,
      severity: el.severity,
      foregroundColor: el.foreground,
      backgroundColor: el.background,
      contrastRatio: el.ratio,
      requiredRatio: el.required,
      pageCount: el.pages.size,
      pages: JSON.stringify([...el.pages]),
    }))

  await db.insert(accessibilityElements).values(systemicElements)

  // 3. Missing alt images
  const altImages = new Map<string, { url: string, pages: Set<string> }>()
  for (const [path, route] of routes) {
    const items = route.audits['image-alt']?.details?.items ?? []
    for (const item of items) {
      const url = item.node?.snippet?.match(/src="([^"]+)"/)?.[1]
      if (!url)
        continue
      const existing = altImages.get(url) ?? { url, pages: new Set() }
      existing.pages.add(path)
      altImages.set(url, existing)
    }
  }

  await db.insert(missingAltImages).values(
    [...altImages.values()].map(img => ({
      scanId,
      url: img.url,
      isDecorative: isLikelyDecorative(img.url),
      pageCount: img.pages.size,
      pages: JSON.stringify([...img.pages]),
    }))
  )

  return computeAccessibilitySummary(issueMap, elementMap)
}

function isLikelyDecorative(url: string): boolean {
  return /icon|arrow|chevron|bullet|decoration/i.test(url)
}

function getWcagLevel(criteria: string[]): string {
  const levels = { A: 1, AA: 2, AAA: 3 }
  // Return highest level from criteria
  // Implementation based on WCAG criteria mapping
  return 'A'
}
```

### 4. SEO Processing

```ts
// packages/core/src/process/seo.ts

export async function processSeo(p: ProcessorParams) {
  const { scanId, routes, htmlData } = p // htmlData from inspectHtmlTask

  // 1. Store per-page SEO meta
  const seoMetaRecords = [...routes.entries()].map(([path, route]) => {
    const html = htmlData.get(path)
    return {
      scanId,
      path,
      title: html?.title,
      titleLength: html?.title?.length,
      metaDescription: html?.metaDescription,
      metaDescriptionLength: html?.metaDescription?.length,
      isIndexable: route.audits['is-crawlable']?.score === 1,
      robotsDirective: html?.robots,
      canonical: html?.canonical,
      canonicalType: getCanonicalType(path, html?.canonical),
      ogTitle: html?.og?.title,
      ogDescription: html?.og?.description,
      ogImage: html?.og?.image,
      ogUrl: html?.og?.url,
      twitterCard: html?.twitter?.card,
      twitterTitle: html?.twitter?.title,
      twitterDescription: html?.twitter?.description,
      twitterImage: html?.twitter?.image,
      hasStructuredData: (html?.jsonLd?.length ?? 0) > 0,
      structuredDataTypes: JSON.stringify(html?.jsonLd?.map(j => j['@type']) ?? []),
      hreflangTags: JSON.stringify(html?.hreflang ?? []),
    }
  })

  await db.insert(seoMeta).values(seoMetaRecords)

  // 2. Find duplicates
  const titleMap = new Map<string, string[]>()
  const descMap = new Map<string, string[]>()

  for (const meta of seoMetaRecords) {
    if (meta.title) {
      const pages = titleMap.get(meta.title) ?? []
      pages.push(meta.path)
      titleMap.set(meta.title, pages)
    }
    if (meta.metaDescription) {
      const pages = descMap.get(meta.metaDescription) ?? []
      pages.push(meta.path)
      descMap.set(meta.metaDescription, pages)
    }
  }

  const duplicates = [
    ...[...titleMap.entries()]
      .filter(([_, pages]) => pages.length > 1)
      .map(([value, pages]) => ({
        scanId,
        type: 'title',
        value,
        pageCount: pages.length,
        pages: JSON.stringify(pages),
      })),
    ...[...descMap.entries()]
      .filter(([_, pages]) => pages.length > 1)
      .map(([value, pages]) => ({
        scanId,
        type: 'meta_description',
        value,
        pageCount: pages.length,
        pages: JSON.stringify(pages),
      })),
  ]

  await db.insert(seoDuplicates).values(duplicates)

  // 3. Detect canonical chains
  const canonicalMap = new Map<string, string>()
  for (const meta of seoMetaRecords) {
    if (meta.canonical && meta.canonical !== meta.path) {
      canonicalMap.set(meta.path, meta.canonical)
    }
  }

  const chains = findCanonicalChains(canonicalMap)
  await db.insert(canonicalChains).values(
    chains.map(chain => ({
      scanId,
      chainType: chain.isLoop ? 'loop' : 'chain',
      pages: JSON.stringify(chain.pages),
      finalTarget: chain.target,
    }))
  )

  // 4. Generic link text
  const linkTextMap = new Map<string, { text: string, count: number, pages: Set<string> }>()
  const genericTexts = ['click here', 'read more', 'learn more', 'here', 'more']

  for (const [path, route] of routes) {
    const items = route.audits['link-text']?.details?.items ?? []
    for (const item of items) {
      const text = item.text?.toLowerCase()
      if (!genericTexts.includes(text))
        continue
      const existing = linkTextMap.get(text) ?? { text: item.text, count: 0, pages: new Set() }
      existing.count++
      existing.pages.add(path)
      linkTextMap.set(text, existing)
    }
  }

  await db.insert(linkTextIssues).values(
    [...linkTextMap.values()].map(lt => ({
      scanId,
      text: lt.text,
      instanceCount: lt.count,
      pageCount: lt.pages.size,
      pages: JSON.stringify([...lt.pages]),
    }))
  )

  return computeSeoSummary(seoMetaRecords, duplicates, chains)
}

function getCanonicalType(path: string, canonical: string | null): string {
  if (!canonical)
    return 'missing'
  if (canonical === path || canonical.endsWith(path))
    return 'self'
  return 'other'
}

function findCanonicalChains(map: Map<string, string>) {
  const chains: { pages: string[], target: string, isLoop: boolean }[] = []
  const visited = new Set<string>()

  for (const [start] of map) {
    if (visited.has(start))
      continue

    const chain = [start]
    let current = start

    while (map.has(current)) {
      const next = map.get(current)!
      if (chain.includes(next)) {
        chains.push({ pages: chain, target: next, isLoop: true })
        break
      }
      chain.push(next)
      current = next
    }

    if (chain.length > 2) {
      chains.push({ pages: chain.slice(0, -1), target: chain.at(-1)!, isLoop: false })
    }

    chain.forEach(p => visited.add(p))
  }

  return chains
}
```

### 5. Best Practices Processing

```ts
// packages/core/src/process/best-practices.ts

export async function processBestPractices(p: ProcessorParams) {
  const { scanId, routes } = p

  // 1. Console errors - group by normalized message
  const errorMap = new Map<string, ConsoleErrorData>()

  for (const [path, route] of routes) {
    const items = route.audits['errors-in-console']?.details?.items ?? []
    for (const item of items) {
      const normalized = normalizeError(item.description)
      const existing = errorMap.get(normalized) ?? {
        message: item.description,
        normalized,
        sourceType: classifySource(item.source, item.description),
        sourceFile: item.source,
        stackTrace: item.stackTrace,
        count: 0,
        pages: new Set<string>(),
      }
      existing.count++
      existing.pages.add(path)
      errorMap.set(normalized, existing)
    }
  }

  await db.insert(consoleErrors).values(
    [...errorMap.values()].map(err => ({
      scanId,
      message: err.message,
      normalizedMessage: err.normalized,
      sourceType: err.sourceType,
      sourceFile: err.sourceFile,
      stackTrace: err.stackTrace,
      instanceCount: err.count,
      pageCount: err.pages.size,
      pages: JSON.stringify([...err.pages]),
    }))
  )

  // 2. Detected libraries
  const libMap = new Map<string, LibraryData>()

  for (const [path, route] of routes) {
    const items = route.audits['js-libraries']?.details?.items ?? []
    for (const item of items) {
      const key = `${item.name}@${item.version ?? 'unknown'}`
      const existing = libMap.get(key) ?? {
        name: item.name,
        version: item.version,
        pages: new Set<string>(),
      }
      existing.pages.add(path)
      libMap.set(key, existing)
    }
  }

  await db.insert(detectedLibraries).values(
    [...libMap.values()].map(lib => ({
      scanId,
      name: lib.name,
      version: lib.version,
      status: 'current', // TODO: check against vulnerability DB
      pageCount: lib.pages.size,
      pages: JSON.stringify([...lib.pages]),
    }))
  )

  // 3. Deprecated APIs
  const apiMap = new Map<string, DeprecatedApiData>()

  for (const [path, route] of routes) {
    const items = route.audits.deprecations?.details?.items ?? []
    for (const item of items) {
      const api = item.value ?? item.description
      const existing = apiMap.get(api) ?? {
        api,
        description: item.description,
        sourceFile: item.source,
        isThirdParty: isThirdPartyUrl(item.source),
        pages: new Set<string>(),
      }
      existing.pages.add(path)
      apiMap.set(api, existing)
    }
  }

  await db.insert(deprecatedApis).values(
    [...apiMap.values()].map(api => ({
      scanId,
      api: api.api,
      description: api.description,
      sourceFile: api.sourceFile,
      isThirdParty: api.isThirdParty,
      pageCount: api.pages.size,
      pages: JSON.stringify([...api.pages]),
    }))
  )

  // 4. Security issues
  const securityIssues: SecurityIssue[] = []

  for (const [path, route] of routes) {
    // Mixed content
    if (route.audits['is-on-https']?.score !== 1) {
      securityIssues.push({
        type: 'mixed-content',
        severity: 'high',
        path,
        details: route.audits['is-on-https']?.details,
      })
    }

    // Unsafe links
    const unsafeLinks = route.audits['external-anchors-use-rel-noopener']?.details?.items ?? []
    if (unsafeLinks.length) {
      securityIssues.push({
        type: 'unsafe-link',
        severity: 'medium',
        path,
        details: { links: unsafeLinks },
      })
    }
  }

  // Group security issues by type
  const securityByType = groupBy(securityIssues, 'type')
  await db.insert(securityIssuesTable).values(
    Object.entries(securityByType).map(([type, issues]) => ({
      scanId,
      type,
      severity: issues[0].severity,
      description: getSecurityDescription(type),
      details: JSON.stringify(issues.map(i => i.details)),
      pageCount: issues.length,
      pages: JSON.stringify(issues.map(i => i.path)),
    }))
  )

  return computeBestPracticesSummary(errorMap, libMap, apiMap, securityByType)
}

function normalizeError(msg: string): string {
  return msg
    .replace(/:\d+:\d+/g, ':X:X') // line:col numbers
    .replace(/0x[0-9a-f]+/gi, '0xXXX') // hex addresses
    .replace(/\d{10,}/g, 'TIMESTAMP') // timestamps
    .slice(0, 200)
}

function classifySource(source: string, msg: string): string {
  if (msg.includes('CSP') || msg.includes('Content-Security-Policy'))
    return 'csp'
  if (msg.includes('net::') || msg.includes('Failed to load'))
    return 'network'
  if (source && isThirdPartyUrl(source))
    return 'thirdParty'
  return 'app'
}

function isThirdPartyUrl(url: string): boolean {
  return !url?.includes(siteHost)
} // compare against scan site host
```

### 6. History Comparison Engine

```ts
// packages/core/src/process/comparison.ts

const THRESHOLDS = {
  lcp: 500, // 500ms change
  cls: 100, // 0.1 CLS (stored as x1000)
  tbt: 200, // 200ms
  fcp: 300,
  si: 500,
  ttfb: 200,
  performance: 5, // 5 points (0-100 scale)
  accessibility: 5,
  bestPractices: 5,
  seo: 5,
}

export async function compareScans(baseScanId: string, currentScanId: string) {
  const baseRoutes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, baseScanId))
  const currentRoutes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, currentScanId))

  const baseByPath = new Map(baseRoutes.map(r => [r.path, r]))
  const currentByPath = new Map(currentRoutes.map(r => [r.path, r]))

  const diffs: ComparisonDiff[] = []
  let improved = 0; let regressed = 0; let unchanged = 0

  for (const [path, current] of currentByPath) {
    const base = baseByPath.get(path)
    if (!base)
      continue

    const metricDiffs = compareRouteMetrics(base, current)
    const hasRegression = metricDiffs.some(m => m.severity === 'regression')
    const hasImprovement = metricDiffs.some(m => m.severity === 'improvement')

    if (hasRegression)
      regressed++
    else if (hasImprovement)
      improved++
    else unchanged++

    if (hasRegression || hasImprovement) {
      diffs.push({
        path,
        url: current.url,
        metricDiffs,
        severity: hasRegression ? 'regression' : 'improvement',
      })
    }
  }

  // Insert comparison record
  const [comparison] = await db.insert(comparisons).values({
    baseScanId,
    currentScanId,
    improved,
    regressed,
    unchanged,
    newUrls: [...currentByPath.keys()].filter(p => !baseByPath.has(p)).length,
    removedUrls: [...baseByPath.keys()].filter(p => !currentByPath.has(p)).length,
  }).returning()

  // Insert diffs
  await db.insert(comparisonDiffs).values(
    diffs.map(diff => ({
      comparisonId: comparison.id,
      path: diff.path,
      url: diff.url,
      metricDiffs: JSON.stringify(diff.metricDiffs),
      severity: diff.severity,
    }))
  )

  return comparison
}

function compareRouteMetrics(base: ScanRoute, current: ScanRoute) {
  const metrics = ['lcp', 'cls', 'tbt', 'fcp', 'si', 'ttfb', 'performanceScore', 'accessibilityScore', 'bestPracticesScore', 'seoScore'] as const

  return metrics.map((name) => {
    const baseVal = base[name] ?? 0
    const currentVal = current[name] ?? 0
    const delta = currentVal - baseVal
    const threshold = THRESHOLDS[name.replace('Score', '')] ?? 5

    // For scores, higher is better. For timings, lower is better.
    const isScore = name.includes('Score')
    const isRegression = isScore ? delta < -threshold : delta > threshold
    const isImprovement = isScore ? delta > threshold : delta < -threshold

    return {
      name,
      base: baseVal,
      current: currentVal,
      delta,
      deltaPercent: baseVal ? Math.round((delta / baseVal) * 100) : 0,
      severity: isRegression ? 'regression' : isImprovement ? 'improvement' : 'neutral',
    }
  }).filter(m => m.severity !== 'neutral')
}
```

### 7. Main Orchestrator

```ts
// packages/core/src/process/index.ts

export async function processScanData(scanId: string) {
  // 1. Load all route LHRs
  const routes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, scanId))

  const extractedRoutes = new Map<string, ExtractedRoute>()
  for (const route of routes) {
    if (!route.lhrGzip)
      continue
    const lhr = JSON.parse(gunzipSync(route.lhrGzip).toString())
    extractedRoutes.set(route.path, extractRouteData(lhr))
  }

  // 2. Load HTML data (from inspectHtmlTask results)
  const htmlData = await loadHtmlData(scanId)

  const params = { scanId, routes: extractedRoutes, htmlData }

  // 3. Process each category in parallel
  const [perfSummary, a11ySummary, bpSummary, seoSummary] = await Promise.all([
    processPerformance(params),
    processAccessibility(params),
    processBestPractices(params),
    processSeo(params),
  ])

  // 4. Store dashboard summaries
  await db.insert(dashboardSummaries).values({
    scanId,
    performanceSummary: JSON.stringify(perfSummary),
    accessibilitySummary: JSON.stringify(a11ySummary),
    bestPracticesSummary: JSON.stringify(bpSummary),
    seoSummary: JSON.stringify(seoSummary),
  })

  // 5. Auto-compare with previous scan (optional)
  const previousScan = await db.select()
    .from(scans)
    .where(and(
      eq(scans.site, (await db.select().from(scans).where(eq(scans.id, scanId)))[0].site),
      eq(scans.status, 'complete'),
      ne(scans.id, scanId),
    ))
    .orderBy(desc(scans.completedAt))
    .limit(1)

  if (previousScan[0]) {
    await compareScans(previousScan[0].id, scanId)
  }
}
```

### 8. HTML Data Extraction (Extended)

```ts
// packages/core/src/puppeteer/tasks/html.ts (extend existing)

export interface ExtendedHtmlData {
  // Existing
  title: string | null
  metaDescription: string | null
  canonical: string | null
  robots: string | null

  // New: Open Graph
  og: {
    title: string | null
    description: string | null
    image: string | null
    url: string | null
    type: string | null
  }

  // New: Twitter Cards
  twitter: {
    card: string | null
    title: string | null
    description: string | null
    image: string | null
    site: string | null
  }

  // New: Hreflang
  hreflang: Array<{ lang: string; href: string }>

  // New: Structured Data
  jsonLd: any[]
}

export const extractHtmlSeoData = (html: string): ExtendedHtmlData => {
  const $ = cheerio.load(html)

  return {
    title: $('title').text() || null,
    metaDescription: $('meta[name="description"]').attr('content') || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    robots: $('meta[name="robots"]').attr('content') || null,

    og: {
      title: $('meta[property="og:title"]').attr('content') || null,
      description: $('meta[property="og:description"]').attr('content') || null,
      image: $('meta[property="og:image"]').attr('content') || null,
      url: $('meta[property="og:url"]').attr('content') || null,
      type: $('meta[property="og:type"]').attr('content') || null,
    },

    twitter: {
      card: $('meta[name="twitter:card"]').attr('content') || null,
      title: $('meta[name="twitter:title"]').attr('content') || null,
      description: $('meta[name="twitter:description"]').attr('content') || null,
      image: $('meta[name="twitter:image"]').attr('content') || null,
      site: $('meta[name="twitter:site"]').attr('content') || null,
    },

    hreflang: $('link[rel="alternate"][hreflang]').map((_, el) => ({
      lang: $(el).attr('hreflang')!,
      href: $(el).attr('href')!,
    })).get(),

    jsonLd: $('script[type="application/ld+json"]').map((_, el) => {
      return JSON.parse($(el).html() || '{}').catch(() => null)
    }).get().filter(Boolean),
  }
}

## Indexes

```ts
// Performance indexes
createIndex('idx_perf_issues_scan_type').on(performanceIssues, (t) => [t.scanId, t.type])
createIndex('idx_third_party_scan').on(thirdPartyScripts, (t) => [t.scanId])

// Accessibility indexes
createIndex('idx_a11y_issues_scan_severity').on(accessibilityIssues, (t) => [t.scanId, t.severity])
createIndex('idx_a11y_elements_scan').on(accessibilityElements, (t) => [t.scanId])

// SEO indexes
createIndex('idx_seo_meta_scan').on(seoMeta, (t) => [t.scanId])
createIndex('idx_seo_duplicates_scan').on(seoDuplicates, (t) => [t.scanId, t.type])

// Comparison indexes
createIndex('idx_comparisons_scans').on(comparisons, (t) => [t.baseScanId, t.currentScanId])
createIndex('idx_diffs_comparison').on(comparisonDiffs, (t) => [t.comparisonId])

// Route metrics for history queries
createIndex('idx_routes_scan_path').on(scanRoutes, (t) => [t.scanId, t.path])
```

## Migration Path

1. **Phase 1**: Add CWV columns to scanRoutes, start storing metrics
2. **Phase 2**: Add performance/accessibility tables, compute on scan complete
3. **Phase 3**: Add SEO tables, extend HTML extraction
4. **Phase 4**: Add comparison tables, implement diff engine
5. **Phase 5**: Add dashboard summaries, optimize load times

## Storage Considerations

| Table | Estimated Size | Notes |
|-------|---------------|-------|
| scanRoutes.lhrGzip | ~50-100KB/route | gzipped LHR |
| dashboardSummaries | ~10-50KB/scan | JSON summaries |
| Issue tables | ~1-5KB/issue | Aggregated |

For a 100-page scan:
- LHR storage: ~5-10MB
- Dashboard data: ~100KB
- Total: ~10MB per scan

## API Integration

Dashboard endpoints:
```
GET /api/scans/:id/dashboard/performance
GET /api/scans/:id/dashboard/accessibility
GET /api/scans/:id/dashboard/best-practices
GET /api/scans/:id/dashboard/seo
GET /api/scans/:id/compare/:baseId
```

Each returns the relevant `*DashboardData` interface from the category todo files.
