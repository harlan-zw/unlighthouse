# Best Practices Dashboard

## Route
`/results/best-practices`

## Database Schema

Uses these tables from `packages/core/src/data/history/schema.ts`:

```typescript
// Security issues (mixed content, unsafe links, etc.)
securityIssues: {
  type: text           // 'mixed-content' | 'unsafe-link' | 'csp' | 'hsts'
  severity: text       // 'critical' | 'high' | 'medium' | 'low'
  description: text
  details: JSON
  pageCount: integer
  pages: JSON array
}

// All detected JS libraries
detectedLibraries: {
  name: text
  version: text
  sourceFile: text
  status: text         // 'current' | 'outdated' | 'vulnerable' | 'deprecated'
  pageCount: integer
  pages: JSON array
}

// Libraries with known vulnerabilities
vulnerableLibraries: {
  name: text
  version: text
  severity: text       // 'critical' | 'high' | 'medium' | 'low'
  cves: JSON array
  description: text
  recommendation: text
  sourceFile: text
  pageCount: integer
  pages: JSON array
}

// Deprecated API usage
deprecatedApis: {
  api: text
  description: text
  alternative: text
  removalDate: text
  isThirdParty: boolean
  sourceFile: text
  pageCount: integer
  pages: JSON array
}

// Console errors (grouped by message)
consoleErrors: {
  message: text
  normalizedMessage: text
  sourceType: text     // 'app' | 'network' | 'csp' | 'thirdParty'
  sourceFile: text
  stackTrace: text
  instanceCount: integer
  pageCount: integer
  pages: JSON array
}

// Route-level scores
scanRoutes: {
  bestPracticesScore: integer
}

// Cached summary
dashboardSummaries.bestPracticesSummary: JSON
```

---

## Dashboard Layout

```
┌─ Summary ───────────────────────────────────────────────────────┐
│  [91] Average Score  │  3 security  2 deprecated  8 page errors │
└─────────────────────────────────────────────────────────────────┘

┌─ Security Overview ─────────────────────────────────────────────┐
│  ✅ HTTPS              All 45 pages secure                      │
│  ⚠️ Mixed Content      3 pages load HTTP resources              │
│  ⚠️ Unsafe Links       12 links missing rel="noopener"          │
│  ❌ CSP                 Not configured                          │
└─────────────────────────────────────────────────────────────────┘

┌─ Vulnerable Libraries ──────────────────────────────────────────┐
│  jQuery 2.1.4         High    45 pages   3 CVEs                 │
│  └─ XSS in .html()    Source: /js/vendor.bundle.js              │
│  lodash 4.17.15       Medium  38 pages   1 CVE                  │
│  └─ Prototype pollution                                         │
└─────────────────────────────────────────────────────────────────┘

┌─ Detected Libraries ────────────────────────────────────────────┐
│  React 18.2.0         ✅ Current    45 pages                    │
│  jQuery 2.1.4         ⚠️ Outdated   45 pages                    │
│  moment 2.29.4        ⚠️ Deprecated 28 pages                    │
└─────────────────────────────────────────────────────────────────┘

┌─ Deprecated APIs ───────────────────────────────────────────────┐
│  document.domain              8 pages   /js/legacy.js           │
│  └─ Alternative: Use postMessage                                │
│  Sync XMLHttpRequest          3 pages   Third-party             │
└─────────────────────────────────────────────────────────────────┘

┌─ Console Errors ────────────────────────────────────────────────┐
│  [Filter: App | Network | CSP | Third-party]                    │
│  "Cannot read 'x' of null"    12    5 pages   App               │
│  "Failed to load: 404"         8    3 pages   Network           │
│  "CSP violation"              45   45 pages   CSP               │
└─────────────────────────────────────────────────────────────────┘

┌─ Worst Pages ───────────────────────────────────────────────────┐
│  /checkout        78   2 security   3 errors   0 deprecated     │
│  /legacy-page     72   0 security   5 errors   2 deprecated     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Queries

### Summary Stats

```typescript
const summary = await db
  .select({
    avgScore: avg(scanRoutes.bestPracticesScore),
    pageCount: count(),
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))

const securityCount = await db
  .select({ count: count() })
  .from(securityIssues)
  .where(eq(securityIssues.scanId, scanId))

const deprecatedCount = await db
  .select({ count: count() })
  .from(deprecatedApis)
  .where(eq(deprecatedApis.scanId, scanId))

const errorPages = await db
  .select({ count: sum(consoleErrors.pageCount) })
  .from(consoleErrors)
  .where(eq(consoleErrors.scanId, scanId))
```

### Security Issues

```typescript
const security = await db
  .select()
  .from(securityIssues)
  .where(eq(securityIssues.scanId, scanId))
  .orderBy(
    // Sort by severity
    sql`CASE severity
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3 END`
  )
```

### Vulnerable Libraries

```typescript
const vulnerable = await db
  .select()
  .from(vulnerableLibraries)
  .where(eq(vulnerableLibraries.scanId, scanId))
  .orderBy(
    sql`CASE severity
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3 END`
  )
```

### All Detected Libraries

```typescript
const libraries = await db
  .select()
  .from(detectedLibraries)
  .where(eq(detectedLibraries.scanId, scanId))
  .orderBy(desc(detectedLibraries.pageCount))
```

### Deprecated APIs

```typescript
const deprecated = await db
  .select()
  .from(deprecatedApis)
  .where(eq(deprecatedApis.scanId, scanId))
  .orderBy(desc(deprecatedApis.pageCount))
```

### Console Errors

```typescript
// All errors
const errors = await db
  .select()
  .from(consoleErrors)
  .where(eq(consoleErrors.scanId, scanId))
  .orderBy(desc(consoleErrors.instanceCount))

// Filtered by source type
const appErrors = await db
  .select()
  .from(consoleErrors)
  .where(and(
    eq(consoleErrors.scanId, scanId),
    eq(consoleErrors.sourceType, 'app')
  ))
```

### Worst Pages

```typescript
const worstPages = await db
  .select({
    path: scanRoutes.path,
    score: scanRoutes.bestPracticesScore,
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))
  .orderBy(asc(scanRoutes.bestPracticesScore))
  .limit(10)
```

---

## Data Extraction (on scan completion)

### Audits to Extract

```typescript
const BP_AUDITS = {
  // Security
  'is-on-https': 'security',
  'external-anchors-use-rel-noopener': 'security',
  'csp-xss': 'security',

  // Libraries
  'js-libraries': 'libraries',
  'no-vulnerable-libraries': 'vulnerable', // Removed in v10, may not exist

  // Deprecated
  'deprecations': 'deprecated',

  // Console
  'errors-in-console': 'console',
}
```

### Console Error Classification

```typescript
function classifyErrorSource(source: string | undefined, message: string): string {
  if (message.includes('Content-Security-Policy') || message.includes('CSP')) {
    return 'csp'
  }
  if (message.includes('Failed to load') || message.includes('404') || message.includes('net::')) {
    return 'network'
  }
  if (source && isThirdPartyUrl(source)) {
    return 'thirdParty'
  }
  return 'app'
}

function isThirdPartyUrl(url: string): boolean {
  const thirdPartyPatterns = [
    /google/i,
    /facebook/i,
    /twitter/i,
    /analytics/i,
    /cdn\./i,
    /cloudflare/i,
    /jsdelivr/i,
    /unpkg/i,
    /hotjar/i,
    /intercom/i,
    /segment/i,
    /mixpanel/i,
  ]
  return thirdPartyPatterns.some(p => p.test(url))
}

function normalizeErrorMessage(msg: string): string {
  // Remove line numbers, file paths, dynamic values
  return msg
    .replace(/:\d+:\d+/g, '') // Line:col
    .replace(/at .+$/gm, '') // Stack frames
    .replace(/\b[a-f0-9]{8,}\b/gi, '') // Hashes
    .trim()
}
```

### Extraction Logic

```typescript
async function extractBestPracticesData(scanId: string, routes: RouteWithLhr[]) {
  const securityMap = new Map<string, SecurityIssue>()
  const libraryMap = new Map<string, DetectedLibrary>()
  const deprecatedMap = new Map<string, DeprecatedApi>()
  const errorMap = new Map<string, ConsoleError>()

  for (const { path, lhr } of routes) {
    // Security: unsafe links
    const unsafeLinks = lhr.audits['external-anchors-use-rel-noopener']?.details?.items || []
    for (const item of unsafeLinks) {
      const key = `unsafe-link:${item.href}`
      const existing = securityMap.get(key) || {
        type: 'unsafe-link',
        severity: 'medium',
        description: `Link to ${item.href} missing rel="noopener"`,
        pages: [],
      }
      if (!existing.pages.includes(path))
        existing.pages.push(path)
      securityMap.set(key, existing)
    }

    // Detected libraries
    const libs = lhr.audits['js-libraries']?.details?.items || []
    for (const lib of libs) {
      const key = `${lib.name}@${lib.version || 'unknown'}`
      const existing = libraryMap.get(key) || {
        name: lib.name,
        version: lib.version,
        status: 'current', // Updated by vulnerability check
        pages: [],
      }
      if (!existing.pages.includes(path))
        existing.pages.push(path)
      libraryMap.set(key, existing)
    }

    // Deprecated APIs
    const deprecations = lhr.audits.deprecations?.details?.items || []
    for (const item of deprecations) {
      const key = item.value || item.description
      const existing = deprecatedMap.get(key) || {
        api: item.value || 'Unknown API',
        description: item.description,
        alternative: item.alternative,
        isThirdParty: isThirdPartyUrl(item.source?.url || ''),
        sourceFile: item.source?.url,
        pages: [],
      }
      if (!existing.pages.includes(path))
        existing.pages.push(path)
      deprecatedMap.set(key, existing)
    }

    // Console errors
    const errors = lhr.audits['errors-in-console']?.details?.items || []
    for (const item of errors) {
      const normalized = normalizeErrorMessage(item.description)
      const sourceType = classifyErrorSource(item.source, item.description)

      const existing = errorMap.get(normalized) || {
        message: item.description,
        normalizedMessage: normalized,
        sourceType,
        sourceFile: item.source,
        stackTrace: item.stackTrace,
        instanceCount: 0,
        pages: [],
      }
      existing.instanceCount++
      if (!existing.pages.includes(path))
        existing.pages.push(path)
      errorMap.set(normalized, existing)
    }
  }

  // Insert into DB
  await db.insert(securityIssues).values(
    Array.from(securityMap.values()).map(s => ({
      scanId,
      ...s,
      pageCount: s.pages.length,
      pages: JSON.stringify(s.pages),
    }))
  )

  await db.insert(detectedLibraries).values(
    Array.from(libraryMap.values()).map(l => ({
      scanId,
      ...l,
      pageCount: l.pages.length,
      pages: JSON.stringify(l.pages),
    }))
  )

  await db.insert(deprecatedApis).values(
    Array.from(deprecatedMap.values()).map(d => ({
      scanId,
      ...d,
      pageCount: d.pages.length,
      pages: JSON.stringify(d.pages),
    }))
  )

  await db.insert(consoleErrors).values(
    Array.from(errorMap.values()).map(e => ({
      scanId,
      ...e,
      pageCount: e.pages.length,
      pages: JSON.stringify(e.pages),
    }))
  )
}
```

---

## Dashboard Summary JSON

Stored in `dashboardSummaries.bestPracticesSummary`:

```typescript
interface BestPracticesSummary {
  avgScore: number
  pageCount: number

  security: {
    httpsPages: number
    mixedContentPages: number
    unsafeLinkCount: number
    cspConfigured: boolean
    hstsConfigured: boolean
  }

  libraries: {
    total: number
    vulnerable: number
    outdated: number
    deprecated: number
  }

  deprecatedApiCount: number
  deprecatedApiThirdParty: number

  consoleErrors: {
    total: number
    pagesAffected: number
    byType: {
      app: number
      network: number
      csp: number
      thirdParty: number
    }
  }
}
```

---

## Security Severity Reference

| Severity | Examples |
|----------|----------|
| Critical | Active vulnerability, data exposure |
| High | Vulnerable library with known exploits |
| Medium | Missing noopener, weak CSP |
| Low | Missing HSTS, informational |

---

## Library Status Reference

| Status | Meaning |
|--------|---------|
| current | Latest stable version |
| outdated | Newer version available |
| vulnerable | Has known CVEs |
| deprecated | Library no longer maintained (e.g., moment.js) |

---

## Notes

**Vulnerable Libraries Audit**: Removed in Lighthouse v10. For vulnerability detection:
1. Use bundled CVE database for common libraries
2. Integrate with Snyk API (optional)
3. Use npm audit if package.json available
4. Show detected libraries with versions for manual review
