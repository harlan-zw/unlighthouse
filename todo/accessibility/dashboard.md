# Accessibility Dashboard

## Route
`/results/accessibility`

## Database Schema

Uses these tables from `packages/core/src/data/history/schema.ts`:

```typescript
// Issues grouped by audit type
accessibilityIssues: {
  auditId: text          // 'color-contrast', 'image-alt'
  title: text            // Human readable
  severity: text         // 'critical' | 'serious' | 'moderate' | 'minor'
  wcagCriteria: JSON     // ['1.4.3', '1.4.6']
  wcagLevel: text        // 'A' | 'AA' | 'AAA'
  instanceCount: integer
  pageCount: integer
  pages: JSON array
}

// Common problem elements (deduplicated)
accessibilityElements: {
  selector: text         // CSS selector
  snippet: text          // HTML snippet
  auditId: text
  severity: text
  issueDescription: text
  // Contrast-specific
  foregroundColor: text
  backgroundColor: text
  contrastRatio: real
  requiredRatio: real
  pageCount: integer
  pages: JSON array
}

// Images missing alt text
missingAltImages: {
  url: text
  thumbnail: text
  isDecorative: boolean
  pageCount: integer
  pages: JSON array
}

// Route-level scores
scanRoutes: {
  accessibilityScore: integer
}

// Cached summary
dashboardSummaries.accessibilitySummary: JSON
```

---

## Dashboard Layout

```
┌─ Summary ───────────────────────────────────────────────────────┐
│  [82] Average Score    │  156 issues across 45 pages            │
└─────────────────────────────────────────────────────────────────┘

┌─ Issues by Severity ────────────────────────────────────────────┐
│  🔴 Critical    12     Blocks access entirely                   │
│  🟠 Serious     45     Major barriers                           │
│  🟡 Moderate    67     Some difficulty                          │
│  🔵 Minor       32     Low impact                               │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────────────────────────────────────────┘

┌─ Issues by Type ────────────────────────────────────────────────┐
│  ████████████████████████  Color Contrast     45  32 pages  🟠  │
│  ██████████████████        Missing Alt Text   32  18 pages  🔴  │
│  ██████████████            Form Labels        24   8 pages  🔴  │
│  ████████████              Empty Links        18  12 pages  🟠  │
└─────────────────────────────────────────────────────────────────┘

┌─ Common Problem Elements ───────────────────────────────────────┐
│  button.btn-primary    Contrast 3.2:1 (needs 4.5:1)   32 pages  │
│  img.product-thumb     Missing alt                    28 pages  │
│  input#email           Missing label                  18 pages  │
└─────────────────────────────────────────────────────────────────┘

┌─ Color Contrast Issues ─────────────────────────────────────────┐
│  #6B7280 on #FFFFFF    4.0:1 (needs 4.5:1)   18 instances       │
│  #FFFFFF on #F59E0B    2.8:1 (needs 4.5:1)   12 instances       │
└─────────────────────────────────────────────────────────────────┘

┌─ Images Missing Alt ────────────────────────────────────────────┐
│  /img/product-1.jpg       12 pages                              │
│  /img/icon-cart.svg       45 pages   (likely decorative)        │
└─────────────────────────────────────────────────────────────────┘

┌─ Worst Pages ───────────────────────────────────────────────────┐
│  /products/catalog    56   4 critical  8 serious   18 total     │
│  /checkout            68   2 critical  5 serious   12 total     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Queries

### Summary Stats

```typescript
const summary = await db
  .select({
    avgScore: avg(scanRoutes.accessibilityScore),
    pageCount: count(),
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))

const totalIssues = await db
  .select({ total: sum(accessibilityIssues.instanceCount) })
  .from(accessibilityIssues)
  .where(eq(accessibilityIssues.scanId, scanId))
```

### Issues by Severity

```typescript
const bySeverity = await db
  .select({
    severity: accessibilityIssues.severity,
    count: sum(accessibilityIssues.instanceCount),
    pageCount: count(distinct(accessibilityIssues.pages)),
  })
  .from(accessibilityIssues)
  .where(eq(accessibilityIssues.scanId, scanId))
  .groupBy(accessibilityIssues.severity)
```

### Issues by Type

```typescript
const byType = await db
  .select({
    auditId: accessibilityIssues.auditId,
    title: accessibilityIssues.title,
    severity: accessibilityIssues.severity,
    instanceCount: accessibilityIssues.instanceCount,
    pageCount: accessibilityIssues.pageCount,
    wcagCriteria: accessibilityIssues.wcagCriteria,
  })
  .from(accessibilityIssues)
  .where(eq(accessibilityIssues.scanId, scanId))
  .orderBy(desc(accessibilityIssues.instanceCount))
```

### Common Problem Elements

```typescript
const commonElements = await db
  .select()
  .from(accessibilityElements)
  .where(eq(accessibilityElements.scanId, scanId))
  .orderBy(desc(accessibilityElements.pageCount))
  .limit(20)
```

### Color Contrast Issues

```typescript
const contrastIssues = await db
  .select()
  .from(accessibilityElements)
  .where(and(
    eq(accessibilityElements.scanId, scanId),
    eq(accessibilityElements.auditId, 'color-contrast')
  ))
  .orderBy(desc(accessibilityElements.pageCount))
```

### Missing Alt Images

```typescript
const missingAlt = await db
  .select()
  .from(missingAltImages)
  .where(eq(missingAltImages.scanId, scanId))
  .orderBy(desc(missingAltImages.pageCount))
```

### Worst Pages

```typescript
// Need to aggregate issues per page - use dashboardSummary or compute
const worstPages = await db
  .select({
    path: scanRoutes.path,
    score: scanRoutes.accessibilityScore,
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))
  .orderBy(asc(scanRoutes.accessibilityScore))
  .limit(10)
```

---

## Data Extraction (on scan completion)

### Severity Mapping

```typescript
const SEVERITY_MAP: Record<string, string> = {
  // Critical - blocks access
  'image-alt': 'critical',
  'label': 'critical',
  'button-name': 'critical',
  'link-name': 'critical',
  'input-image-alt': 'critical',

  // Serious - major barriers
  'color-contrast': 'serious',
  'html-has-lang': 'serious',
  'meta-viewport': 'serious',
  'aria-required-attr': 'serious',
  'aria-valid-attr': 'serious',

  // Moderate - some difficulty
  'heading-order': 'moderate',
  'tabindex': 'moderate',
  'bypass': 'moderate',
  'document-title': 'moderate',

  // Minor - nuisance
  'duplicate-id-aria': 'minor',
  'meta-refresh': 'minor',
}

const WCAG_MAP: Record<string, { criteria: string[], level: string }> = {
  'image-alt': { criteria: ['1.1.1'], level: 'A' },
  'color-contrast': { criteria: ['1.4.3'], level: 'AA' },
  'label': { criteria: ['1.3.1', '4.1.2'], level: 'A' },
  'html-has-lang': { criteria: ['3.1.1'], level: 'A' },
  // ... etc
}
```

### Extraction Logic

```typescript
async function extractAccessibilityData(scanId: string, routes: RouteWithLhr[]) {
  const issueMap = new Map<string, AccessibilityIssue>()
  const elementMap = new Map<string, AccessibilityElement>()
  const imageMap = new Map<string, MissingAltImage>()

  for (const { path, lhr } of routes) {
    for (const [auditId, audit] of Object.entries(lhr.audits)) {
      if (audit.score === 1 || audit.score === null)
        continue
      if (!SEVERITY_MAP[auditId])
        continue

      const items = audit.details?.items || []
      const severity = SEVERITY_MAP[auditId]
      const wcag = WCAG_MAP[auditId]

      // Aggregate by audit type
      const issueKey = auditId
      const existing = issueMap.get(issueKey) || {
        auditId,
        title: audit.title,
        severity,
        wcagCriteria: wcag?.criteria || [],
        wcagLevel: wcag?.level,
        instanceCount: 0,
        pages: [],
      }
      existing.instanceCount += items.length
      if (!existing.pages.includes(path))
        existing.pages.push(path)
      issueMap.set(issueKey, existing)

      // Aggregate by element (for common problems)
      for (const item of items) {
        const selector = item.node?.selector
        if (!selector)
          continue

        const elementKey = `${auditId}:${selector}`
        const existingEl = elementMap.get(elementKey) || {
          selector,
          snippet: item.node?.snippet,
          auditId,
          severity,
          issueDescription: item.node?.explanation,
          foregroundColor: item.foregroundColor,
          backgroundColor: item.backgroundColor,
          contrastRatio: item.contrastRatio,
          requiredRatio: item.expectedContrastRatio,
          pages: [],
        }
        if (!existingEl.pages.includes(path))
          existingEl.pages.push(path)
        elementMap.set(elementKey, existingEl)

        // Track missing alt images separately
        if (auditId === 'image-alt' && item.node?.selector) {
          const imgUrl = extractImageUrl(item.node)
          if (imgUrl) {
            const existingImg = imageMap.get(imgUrl) || {
              url: imgUrl,
              isDecorative: isLikelyDecorative(imgUrl),
              pages: [],
            }
            if (!existingImg.pages.includes(path))
              existingImg.pages.push(path)
            imageMap.set(imgUrl, existingImg)
          }
        }
      }
    }
  }

  // Insert into DB
  await db.insert(accessibilityIssues).values(
    Array.from(issueMap.values()).map(i => ({
      scanId,
      ...i,
      pageCount: i.pages.length,
      wcagCriteria: JSON.stringify(i.wcagCriteria),
      pages: JSON.stringify(i.pages),
    }))
  )

  await db.insert(accessibilityElements).values(
    Array.from(elementMap.values())
      .filter(e => e.pages.length > 1) // Only multi-page issues
      .map(e => ({
        scanId,
        ...e,
        pageCount: e.pages.length,
        pages: JSON.stringify(e.pages),
      }))
  )

  await db.insert(missingAltImages).values(
    Array.from(imageMap.values()).map(i => ({
      scanId,
      ...i,
      pageCount: i.pages.length,
      pages: JSON.stringify(i.pages),
    }))
  )
}

function isLikelyDecorative(url: string): boolean {
  const decorativePatterns = [
    /icon/i,
    /arrow/i,
    /chevron/i,
    /bullet/i,
    /spacer/i,
    /divider/i,
    /line/i,
    /dot/i,
    /-bg\./i,
    /background/i,
  ]
  return decorativePatterns.some(p => p.test(url))
}
```

---

## Dashboard Summary JSON

Stored in `dashboardSummaries.accessibilitySummary`:

```typescript
interface AccessibilitySummary {
  avgScore: number
  pageCount: number
  totalIssues: number
  pagesWithIssues: number

  bySeverity: {
    critical: { count: number, pages: number }
    serious: { count: number, pages: number }
    moderate: { count: number, pages: number }
    minor: { count: number, pages: number }
  }

  topIssues: Array<{
    auditId: string
    title: string
    severity: string
    instanceCount: number
    pageCount: number
  }>

  // For quick stats
  contrastIssueCount: number
  missingAltCount: number
  missingLabelCount: number
}
```

---

## Severity Reference

| Severity | Impact | Examples |
|----------|--------|----------|
| Critical | Blocks access entirely | Missing alt, missing label, empty button |
| Serious | Major barriers | Color contrast, missing lang, viewport |
| Moderate | Extra effort required | Heading order, tabindex, bypass blocks |
| Minor | Nuisance | Duplicate IDs, meta refresh |

---

## WCAG Level Reference

| Level | Requirement | % of audits |
|-------|-------------|-------------|
| A | Minimum accessibility | ~60% |
| AA | Standard (most laws) | ~35% |
| AAA | Enhanced | ~5% |

Note: Automated testing catches only 30-50% of WCAG issues. Dashboard should display disclaimer.
