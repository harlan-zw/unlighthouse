# LHCI Integration Strategy

## Overview

Unlighthouse may pivot toward CI-focused workflows. Rather than depending on or fully forking LHCI Server, we'll cherry-pick useful patterns and build a low-maintenance comparison system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     unlighthouse-ci                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                            │
│  │  Crawler    │ ← discovers all URLs (unique value)        │
│  └──────┬──────┘                                            │
│         ↓                                                   │
│  ┌─────────────┐                                            │
│  │  LH Runner  │ ← runs lighthouse on each URL              │
│  └──────┬──────┘                                            │
│         ↓                                                   │
│  ┌─────────────┐     ┌─────────────┐                        │
│  │  Extractor  │ ──► │  SQLite DB  │                        │
│  │  (isolates  │     │  - metrics  │                        │
│  │   LH ver)   │     │  - lhr gzip │                        │
│  └─────────────┘     └──────┬──────┘                        │
│                             ↓                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Comparison Engine (works on extracted metrics)      │    │
│  │  • Build-to-build diffs                              │    │
│  │  • Regression detection                              │    │
│  │  • Assertions                                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Value Proposition

```
Unlighthouse CI = LHCI + Site-Wide Crawling

"Run Lighthouse CI checks across your ENTIRE site, not just configured URLs"
```

## What to Take from LHCI

### Worth Borrowing (Ideas/Patterns)

| Concept | Source | Notes |
|---------|--------|-------|
| Representative run selection | `@lhci/utils/representative-runs.js` | Median-based approach for handling variance |
| Assertion types | `@lhci/utils/assertions.js` | minScore, maxLength, maxNumericValue |
| Diff severity scoring | `@lhci/utils/audit-diff-finder.js` | Weighted severity for different change types |
| Statistics extraction | LHCI server | Pre-compute key metrics from LHR |
| LHR compression | LHCI server | gzip before storing |

### Not Worth Taking

| Component | Why Skip |
|-----------|----------|
| Express server | Use Nitro |
| Sequelize ORM | Use Drizzle |
| Project/token auth | Different model |
| CLI | Have our own |
| Dashboard UI | Have Nuxt UI |
| Build-centric data model | Too rigid for crawling use case |

## Low-Maintenance Comparison Strategy

### Problem: Lighthouse Volatility

```
Lighthouse v10 → v11 → v12
     ↓            ↓
  LHR schema changes (audit names, structure, metrics)
     ↓
  Diff logic breaks if tightly coupled
```

### Solution: Extract → Compare Pattern

Isolate LHR structure knowledge to one file. Compare on stable extracted metrics.

### Stability Tiers

| Stability | What | Example |
|-----------|------|---------|
| Very stable | Category scores | `performance: 0.85` |
| Stable | Core Web Vitals | LCP, CLS, INP |
| Medium | Audit IDs | `uses-responsive-images` |
| Volatile | Details structure | `items[].wastedBytes` format |

## Implementation

### Schema (Drizzle)

```ts
// packages/core/src/data/history/schema.ts

export const scanRoutes = sqliteTable('scan_routes', {
  id: text('id').primaryKey(),
  scanId: text('scan_id').references(() => scans.id),
  url: text('url'),
  path: text('path'),

  // Category scores (very stable)
  scorePerformance: real('score_performance'),
  scoreAccessibility: real('score_accessibility'),
  scoreSeo: real('score_seo'),
  scoreBestPractices: real('score_best_practices'),

  // Core Web Vitals (stable)
  lcp: integer('lcp'), // Largest Contentful Paint (ms)
  cls: real('cls'), // Cumulative Layout Shift
  inp: integer('inp'), // Interaction to Next Paint (ms)
  fcp: integer('fcp'), // First Contentful Paint (ms)
  ttfb: integer('ttfb'), // Time to First Byte (ms)
  tbt: integer('tbt'), // Total Blocking Time (ms)
  si: integer('si'), // Speed Index (ms)

  // Raw LHR for deep dives
  lhrGzip: blob('lhr_gzip'), // Compressed full report

  createdAt: integer('created_at', { mode: 'timestamp' }),
})
```

### Extractor (LH Version Isolation)

```ts
// packages/core/src/comparison/extract.ts

import { gzipSync } from 'node:zlib'

interface ExtractedMetrics {
  scorePerformance: number | null
  scoreAccessibility: number | null
  scoreSeo: number | null
  scoreBestPractices: number | null
  lcp: number | null
  cls: number | null
  inp: number | null
  fcp: number | null
  ttfb: number | null
  tbt: number | null
  si: number | null
  lhrGzip: Buffer
}

export function extractMetrics(lhr: LHR): ExtractedMetrics {
  return {
    scorePerformance: lhr.categories.performance?.score ?? null,
    scoreAccessibility: lhr.categories.accessibility?.score ?? null,
    scoreSeo: lhr.categories.seo?.score ?? null,
    scoreBestPractices: lhr.categories['best-practices']?.score ?? null,
    lcp: getNumericValue(lhr, 'largest-contentful-paint'),
    cls: getNumericValue(lhr, 'cumulative-layout-shift'),
    inp: getNumericValue(lhr, 'interaction-to-next-paint'),
    fcp: getNumericValue(lhr, 'first-contentful-paint'),
    ttfb: getNumericValue(lhr, 'server-response-time'),
    tbt: getNumericValue(lhr, 'total-blocking-time'),
    si: getNumericValue(lhr, 'speed-index'),
    lhrGzip: gzipSync(JSON.stringify(lhr)),
  }
}

function getNumericValue(lhr: LHR, auditId: string): number | null {
  // Version-specific mappings can go here
  const audit = lhr.audits[auditId]
  return audit?.numericValue ?? null
}

// When Lighthouse changes audit IDs, update here only
const AUDIT_ID_MAP_V13: Record<string, string> = {
  // 'old-id': 'new-id',
}
```

### Comparison Engine

```ts
// packages/core/src/comparison/diff.ts

interface RouteDiff {
  url: string
  path: string
  metrics: {
    name: string
    base: number | null
    current: number | null
    delta: number
    deltaPercent: number
    severity: 'improvement' | 'regression' | 'neutral'
  }[]
}

interface BuildComparison {
  baseId: string
  currentId: string
  diffs: RouteDiff[]
  summary: {
    improved: number
    regressed: number
    unchanged: number
    newUrls: number
    removedUrls: number
  }
}

const THRESHOLDS = {
  scorePerformance: 0.05, // 5% change
  scoreAccessibility: 0.05,
  scoreSeo: 0.05,
  scoreBestPractices: 0.05,
  lcp: 500, // 500ms change
  cls: 0.1, // 0.1 CLS change
  inp: 200, // 200ms change
  fcp: 300,
  ttfb: 200,
  tbt: 300,
  si: 500,
}

export function compareBuilds(
  baseRoutes: ScanRoute[],
  currentRoutes: ScanRoute[]
): BuildComparison {
  const diffs: RouteDiff[] = []
  const baseByUrl = new Map(baseRoutes.map(r => [r.url, r]))
  const currentByUrl = new Map(currentRoutes.map(r => [r.url, r]))

  let improved = 0; let regressed = 0; let unchanged = 0

  for (const [url, current] of currentByUrl) {
    const base = baseByUrl.get(url)
    if (!base)
      continue

    const metrics = compareMetrics(base, current)
    const hasRegression = metrics.some(m => m.severity === 'regression')
    const hasImprovement = metrics.some(m => m.severity === 'improvement')

    if (hasRegression)
      regressed++
    else if (hasImprovement)
      improved++
    else unchanged++

    if (hasRegression || hasImprovement) {
      diffs.push({ url, path: current.path, metrics })
    }
  }

  return {
    baseId: baseRoutes[0]?.scanId,
    currentId: currentRoutes[0]?.scanId,
    diffs,
    summary: {
      improved,
      regressed,
      unchanged,
      newUrls: [...currentByUrl.keys()].filter(u => !baseByUrl.has(u)).length,
      removedUrls: [...baseByUrl.keys()].filter(u => !currentByUrl.has(u)).length,
    },
  }
}

function compareMetrics(base: ScanRoute, current: ScanRoute) {
  const metrics = ['scorePerformance', 'scoreAccessibility', 'scoreSeo', 'scoreBestPractices', 'lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'] as const

  return metrics.map((name) => {
    const baseVal = base[name]
    const currentVal = current[name]
    const delta = (currentVal ?? 0) - (baseVal ?? 0)
    const deltaPercent = baseVal ? (delta / baseVal) * 100 : 0
    const threshold = THRESHOLDS[name]

    // For scores, higher is better. For timings, lower is better.
    const isScore = name.startsWith('score')
    const isRegression = isScore ? delta < -threshold : delta > threshold
    const isImprovement = isScore ? delta > threshold : delta < -threshold

    return {
      name,
      base: baseVal,
      current: currentVal,
      delta,
      deltaPercent,
      severity: isRegression ? 'regression' : isImprovement ? 'improvement' : 'neutral',
    }
  }).filter(m => m.severity !== 'neutral')
}
```

### Assertions System

```ts
// packages/core/src/comparison/assertions.ts

type AssertionType = 'minScore' | 'maxNumericValue' | 'maxRegression'

interface Assertion {
  type: AssertionType
  category?: string // performance, accessibility, seo, best-practices
  metric?: string // lcp, cls, inp, etc.
  value: number
  failOn?: 'any' | 'average'
}

interface AssertionResult {
  assertion: Assertion
  passed: boolean
  actual: number
  routes?: { url: string, value: number }[] // failing routes
}

export function evaluateAssertions(
  routes: ScanRoute[],
  assertions: Assertion[]
): AssertionResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'minScore':
        return evaluateMinScore(routes, assertion)
      case 'maxNumericValue':
        return evaluateMaxNumeric(routes, assertion)
      case 'maxRegression':
        return evaluateMaxRegression(routes, assertion)
    }
  })
}

function evaluateMinScore(routes: ScanRoute[], assertion: Assertion): AssertionResult {
  const key = `score${capitalize(assertion.category)}` as keyof ScanRoute
  const values = routes.map(r => ({ url: r.url, value: r[key] as number }))

  if (assertion.failOn === 'average') {
    const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length
    return { assertion, passed: avg >= assertion.value, actual: avg }
  }

  // failOn: 'any' (default)
  const failing = values.filter(v => v.value < assertion.value)
  return {
    assertion,
    passed: failing.length === 0,
    actual: Math.min(...values.map(v => v.value)),
    routes: failing,
  }
}
```

### Config Schema

```ts
// unlighthouse.config.ts

export default {
  site: 'https://example.com',

  ci: {
    // Build metadata
    build: {
      branch: process.env.GITHUB_REF_NAME,
      hash: process.env.GITHUB_SHA,
      message: process.env.GITHUB_COMMIT_MESSAGE,
    },

    // Assertions
    assertions: [
      { type: 'minScore', category: 'performance', value: 0.8, failOn: 'any' },
      { type: 'minScore', category: 'accessibility', value: 0.9 },
      { type: 'maxNumericValue', metric: 'lcp', value: 2500 },
      { type: 'maxNumericValue', metric: 'cls', value: 0.1 },
    ],

    // Comparison
    comparison: {
      enabled: true,
      baseBranch: 'main',
      thresholds: {
        scorePerformance: 0.05,
        lcp: 500,
        // ...
      },
    },
  },
}
```

### CLI Usage

```bash
# Run scan with assertions
unlighthouse-ci --site https://example.com --assert

# Compare against previous build
unlighthouse-ci --site https://example.com --compare main

# Full CI mode
unlighthouse-ci \
  --site https://example.com \
  --assert \
  --compare main \
  --upload  # store results for future comparisons
```

## Migration Path

1. **Phase 1**: Add extracted metrics columns to schema
2. **Phase 2**: Build extractor, store metrics on scan
3. **Phase 3**: Add comparison engine
4. **Phase 4**: Add assertions system
5. **Phase 5**: CLI integration for CI workflows

## When Lighthouse Changes

Only `extract.ts` needs updating:

```ts
function getNumericValue(lhr: LHR, auditId: string): number | null {
  // Handle version differences
  const version = lhr.lighthouseVersion
  const id = version.startsWith('13.')
    ? AUDIT_ID_MAP_V13[auditId] ?? auditId
    : auditId
  return lhr.audits[id]?.numericValue ?? null
}
```

Comparison logic stays untouched.

## References

- [LHCI Server Docs](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/server.md)
- [LHCI Utils Source](https://github.com/GoogleChrome/lighthouse-ci/tree/main/packages/utils/src)
- [@lhci/utils npm](https://www.npmjs.com/package/@lhci/utils)
- [Lighthouse Scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
