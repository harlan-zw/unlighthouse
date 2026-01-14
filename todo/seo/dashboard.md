# SEO Dashboard

## Route
`/results/seo`

## Database Schema

Uses these tables from `packages/core/src/data/history/schema.ts`:

```typescript
// Per-page SEO metadata
seoMeta: {
  path: text
  // Title
  title: text
  titleLength: integer
  // Meta description
  metaDescription: text
  metaDescriptionLength: integer
  // Indexability
  isIndexable: boolean
  robotsDirective: text
  blockedByRobotsTxt: boolean
  // Canonical
  canonical: text
  canonicalType: text        // 'self' | 'other' | 'missing'
  // Open Graph
  ogTitle: text
  ogDescription: text
  ogImage: text
  ogUrl: text
  // Twitter
  twitterCard: text
  twitterTitle: text
  twitterDescription: text
  twitterImage: text
  // Structured data
  hasStructuredData: boolean
  structuredDataTypes: JSON   // ['Product', 'Article']
  structuredDataValid: boolean
  structuredDataWarnings: text
  // Hreflang
  hreflangTags: JSON
}

// Duplicate titles/descriptions
seoDuplicates: {
  type: text                 // 'title' | 'meta_description'
  value: text                // The duplicated value
  pageCount: integer
  pages: JSON array
}

// Canonical chains/loops
canonicalChains: {
  chainType: text            // 'chain' | 'loop'
  pages: JSON array          // [A, B, C] means A→B→C
  finalTarget: text
}

// Generic link text issues
linkTextIssues: {
  text: text                 // "Click here", "Read more"
  instanceCount: integer
  pageCount: integer
  pages: JSON array
}

// Tap target issues (per page)
tapTargetIssues: {
  path: text
  elementCount: integer
  elements: JSON array
}

// Route-level scores
scanRoutes: {
  seoScore: integer
}

// Cached summary
dashboardSummaries.seoSummary: JSON
```

---

## Dashboard Layout

```
┌─ Summary ───────────────────────────────────────────────────────┐
│  [88] Average Score  │  42/45 indexable  7 missing meta desc    │
└─────────────────────────────────────────────────────────────────┘

┌─ Indexability ──────────────────────────────────────────────────┐
│  ✅ Indexable              42 pages (93%)                       │
│  ⚠️ Blocked by robots.txt   2 pages    → View                   │
│  ❌ Noindex meta             1 page     → View                   │
└─────────────────────────────────────────────────────────────────┘

┌─ Title Tags ────────────────────────────────────────────────────┐
│  ✅ Valid               38     Unique, good length              │
│  ⚠️ Missing              2     /products, /contact              │
│  ⚠️ Duplicate            3     Same title on 3 pages            │
│  ⚠️ Too short            1     /about (12 chars)                │
│  ⚠️ Too long             1     /services (78 chars)             │
└─────────────────────────────────────────────────────────────────┘

┌─ Meta Descriptions ─────────────────────────────────────────────┐
│  ✅ Valid               32     Good length, unique              │
│  ⚠️ Missing              7     → View pages                     │
│  ⚠️ Too short            3     <70 chars                        │
│  ⚠️ Too long             2     >160 chars                       │
│  ⚠️ Duplicate            1     Same on 2 pages                  │
└─────────────────────────────────────────────────────────────────┘

┌─ Canonical Tags ────────────────────────────────────────────────┐
│  ✅ Self-referencing    38     Correctly configured             │
│  ✅ Points to other      4     Intentional canonical            │
│  ⚠️ Missing              2     No canonical tag                 │
│  ❌ Chain detected       1     A → B → C                        │
└─────────────────────────────────────────────────────────────────┘

┌─ Structured Data ───────────────────────────────────────────────┐
│  Coverage: 28/45 pages (62%)                                    │
│  Schema types: BreadcrumbList (28), Product (12), Article (8)   │
│  ✅ Valid              26     ⚠️ Warnings 2     ❌ Invalid 0    │
└─────────────────────────────────────────────────────────────────┘

┌─ Social Meta Tags ──────────────────────────────────────────────┐
│  Open Graph: og:title 71% | og:description 71% | og:image 62%   │
│  Twitter: twitter:card 62% | twitter:title 62% | twitter:image 53% │
└─────────────────────────────────────────────────────────────────┘

┌─ Link Quality ──────────────────────────────────────────────────┐
│  ⚠️ Generic link text       12 instances                        │
│     "Click here" (5), "Read more" (4), "Learn more" (3)         │
└─────────────────────────────────────────────────────────────────┘

┌─ Mobile UX ─────────────────────────────────────────────────────┐
│  ✅ Viewport configured    45 pages                             │
│  ⚠️ Tap targets too small   8 pages    → View                   │
└─────────────────────────────────────────────────────────────────┘

┌─ Worst Pages ───────────────────────────────────────────────────┐
│  /products        72    Missing title, meta description         │
│  /blog/page/2     78    Duplicate title, no schema              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Queries

### Summary Stats

```typescript
const summary = await db
  .select({
    avgScore: avg(scanRoutes.seoScore),
    pageCount: count(),
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))

const indexable = await db
  .select({ count: count() })
  .from(seoMeta)
  .where(and(
    eq(seoMeta.scanId, scanId),
    eq(seoMeta.isIndexable, true)
  ))

const missingMetaDesc = await db
  .select({ count: count() })
  .from(seoMeta)
  .where(and(
    eq(seoMeta.scanId, scanId),
    isNull(seoMeta.metaDescription)
  ))
```

### Indexability Breakdown

```typescript
const indexability = await db
  .select({
    path: seoMeta.path,
    isIndexable: seoMeta.isIndexable,
    robotsDirective: seoMeta.robotsDirective,
    blockedByRobotsTxt: seoMeta.blockedByRobotsTxt,
  })
  .from(seoMeta)
  .where(eq(seoMeta.scanId, scanId))

const blocked = indexability.filter(p => !p.isIndexable)
```

### Title Tag Analysis

```typescript
const titles = await db
  .select({
    path: seoMeta.path,
    title: seoMeta.title,
    titleLength: seoMeta.titleLength,
  })
  .from(seoMeta)
  .where(eq(seoMeta.scanId, scanId))

const titleStats = {
  valid: titles.filter(t => t.title && t.titleLength >= 30 && t.titleLength <= 60).length,
  missing: titles.filter(t => !t.title).map(t => t.path),
  tooShort: titles.filter(t => t.title && t.titleLength < 30),
  tooLong: titles.filter(t => t.title && t.titleLength > 60),
}

// Duplicates
const duplicateTitles = await db
  .select()
  .from(seoDuplicates)
  .where(and(
    eq(seoDuplicates.scanId, scanId),
    eq(seoDuplicates.type, 'title')
  ))
```

### Meta Description Analysis

```typescript
const metaDescs = await db
  .select({
    path: seoMeta.path,
    metaDescription: seoMeta.metaDescription,
    metaDescriptionLength: seoMeta.metaDescriptionLength,
  })
  .from(seoMeta)
  .where(eq(seoMeta.scanId, scanId))

const metaDescStats = {
  valid: metaDescs.filter(m => m.metaDescription && m.metaDescriptionLength >= 70 && m.metaDescriptionLength <= 160).length,
  missing: metaDescs.filter(m => !m.metaDescription).map(m => m.path),
  tooShort: metaDescs.filter(m => m.metaDescription && m.metaDescriptionLength < 70),
  tooLong: metaDescs.filter(m => m.metaDescription && m.metaDescriptionLength > 160),
}

// Duplicates
const duplicateMetaDescs = await db
  .select()
  .from(seoDuplicates)
  .where(and(
    eq(seoDuplicates.scanId, scanId),
    eq(seoDuplicates.type, 'meta_description')
  ))
```

### Canonical Analysis

```typescript
const canonicals = await db
  .select({
    path: seoMeta.path,
    canonical: seoMeta.canonical,
    canonicalType: seoMeta.canonicalType,
  })
  .from(seoMeta)
  .where(eq(seoMeta.scanId, scanId))

const canonicalStats = {
  selfReferencing: canonicals.filter(c => c.canonicalType === 'self').length,
  pointsToOther: canonicals.filter(c => c.canonicalType === 'other'),
  missing: canonicals.filter(c => c.canonicalType === 'missing').map(c => c.path),
}

// Chains and loops
const chains = await db
  .select()
  .from(canonicalChains)
  .where(eq(canonicalChains.scanId, scanId))
```

### Structured Data Coverage

```typescript
const structuredData = await db
  .select({
    path: seoMeta.path,
    hasStructuredData: seoMeta.hasStructuredData,
    structuredDataTypes: seoMeta.structuredDataTypes,
    structuredDataValid: seoMeta.structuredDataValid,
    structuredDataWarnings: seoMeta.structuredDataWarnings,
  })
  .from(seoMeta)
  .where(eq(seoMeta.scanId, scanId))

const coverage = structuredData.filter(s => s.hasStructuredData).length
const schemaTypes = new Map<string, number>()
structuredData.forEach((s) => {
  const types = JSON.parse(s.structuredDataTypes || '[]')
  types.forEach(t => schemaTypes.set(t, (schemaTypes.get(t) || 0) + 1))
})
```

### Social Meta Coverage

```typescript
const socialMeta = await db
  .select({
    ogTitle: seoMeta.ogTitle,
    ogDescription: seoMeta.ogDescription,
    ogImage: seoMeta.ogImage,
    twitterCard: seoMeta.twitterCard,
    twitterTitle: seoMeta.twitterTitle,
    twitterImage: seoMeta.twitterImage,
  })
  .from(seoMeta)
  .where(eq(seoMeta.scanId, scanId))

const total = socialMeta.length
const ogStats = {
  title: socialMeta.filter(s => s.ogTitle).length,
  description: socialMeta.filter(s => s.ogDescription).length,
  image: socialMeta.filter(s => s.ogImage).length,
}
const twitterStats = {
  card: socialMeta.filter(s => s.twitterCard).length,
  title: socialMeta.filter(s => s.twitterTitle).length,
  image: socialMeta.filter(s => s.twitterImage).length,
}
```

### Link Text Issues

```typescript
const linkIssues = await db
  .select()
  .from(linkTextIssues)
  .where(eq(linkTextIssues.scanId, scanId))
  .orderBy(desc(linkTextIssues.instanceCount))
```

### Tap Target Issues

```typescript
const tapTargets = await db
  .select()
  .from(tapTargetIssues)
  .where(eq(tapTargetIssues.scanId, scanId))
```

### Worst Pages

```typescript
const worstPages = await db
  .select({
    path: scanRoutes.path,
    score: scanRoutes.seoScore,
  })
  .from(scanRoutes)
  .where(eq(scanRoutes.scanId, scanId))
  .orderBy(asc(scanRoutes.seoScore))
  .limit(10)
```

---

## Data Extraction (on scan completion)

### From inspectHtmlTask (extend existing)

The HTML inspection task should extract:

```typescript
interface HtmlSeoData {
  // Already extracted
  title: string | null
  metaDescription: string | null

  // Add these
  canonical: string | null
  robotsDirective: string | null // From <meta name="robots">

  // Open Graph
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  ogUrl: string | null

  // Twitter
  twitterCard: string | null
  twitterTitle: string | null
  twitterDescription: string | null
  twitterImage: string | null

  // Hreflang
  hreflangTags: Array<{ lang: string, href: string }>

  // Structured data (JSON-LD)
  jsonLd: any[]
}
```

### From Lighthouse Audits

```typescript
const SEO_AUDITS = {
  'is-crawlable': 'indexability', // Blocked by robots
  'document-title': 'title', // Title presence
  'meta-description': 'description', // Meta description
  'canonical': 'canonical', // Canonical issues
  'hreflang': 'hreflang', // Hreflang validation
  'viewport': 'mobile', // Viewport meta
  'tap-targets': 'tapTargets', // Tap target sizing
  'link-text': 'linkText', // Link text quality
}
```

### Extraction Logic

```typescript
async function extractSeoData(scanId: string, routes: RouteWithHtmlAndLhr[]) {
  const seoMetaRecords: SeoMeta[] = []
  const titleMap = new Map<string, string[]>()
  const metaDescMap = new Map<string, string[]>()
  const canonicalMap = new Map<string, string>() // For chain detection
  const linkTextMap = new Map<string, { count: number, pages: string[] }>()

  for (const { path, html, lhr } of routes) {
    // Build seoMeta record
    const record: SeoMeta = {
      scanId,
      path,
      title: html.title,
      titleLength: html.title?.length || 0,
      metaDescription: html.metaDescription,
      metaDescriptionLength: html.metaDescription?.length || 0,

      isIndexable: lhr.audits['is-crawlable']?.score === 1,
      robotsDirective: html.robotsDirective,
      blockedByRobotsTxt: lhr.audits['is-crawlable']?.details?.items?.some(
        i => i.source?.type === 'robotsTxt'
      ) || false,

      canonical: html.canonical,
      canonicalType: html.canonical
        ? (html.canonical === path ? 'self' : 'other')
        : 'missing',

      ogTitle: html.ogTitle,
      ogDescription: html.ogDescription,
      ogImage: html.ogImage,
      ogUrl: html.ogUrl,

      twitterCard: html.twitterCard,
      twitterTitle: html.twitterTitle,
      twitterDescription: html.twitterDescription,
      twitterImage: html.twitterImage,

      hasStructuredData: html.jsonLd?.length > 0,
      structuredDataTypes: JSON.stringify(
        html.jsonLd?.map(j => j['@type']).flat().filter(Boolean) || []
      ),
      structuredDataValid: lhr.audits['structured-data-jsonld']?.score === 1,
      structuredDataWarnings: lhr.audits['structured-data-jsonld']?.details?.items
        ?.map(i => i.message)
        .join('; '),

      hreflangTags: JSON.stringify(html.hreflangTags || []),
    }
    seoMetaRecords.push(record)

    // Track duplicates
    if (html.title) {
      const pages = titleMap.get(html.title) || []
      pages.push(path)
      titleMap.set(html.title, pages)
    }
    if (html.metaDescription) {
      const pages = metaDescMap.get(html.metaDescription) || []
      pages.push(path)
      metaDescMap.set(html.metaDescription, pages)
    }

    // Track canonicals for chain detection
    if (html.canonical && html.canonical !== path) {
      canonicalMap.set(path, html.canonical)
    }

    // Track link text issues
    const linkTextItems = lhr.audits['link-text']?.details?.items || []
    for (const item of linkTextItems) {
      const text = item.text?.toLowerCase()
      if (text) {
        const existing = linkTextMap.get(text) || { count: 0, pages: [] }
        existing.count++
        if (!existing.pages.includes(path))
          existing.pages.push(path)
        linkTextMap.set(text, existing)
      }
    }
  }

  // Insert seoMeta
  await db.insert(seoMeta).values(seoMetaRecords)

  // Insert duplicates (only where count > 1)
  const duplicates: SeoDuplicate[] = []
  titleMap.forEach((pages, value) => {
    if (pages.length > 1) {
      duplicates.push({
        scanId,
        type: 'title',
        value,
        pageCount: pages.length,
        pages: JSON.stringify(pages),
      })
    }
  })
  metaDescMap.forEach((pages, value) => {
    if (pages.length > 1) {
      duplicates.push({
        scanId,
        type: 'meta_description',
        value,
        pageCount: pages.length,
        pages: JSON.stringify(pages),
      })
    }
  })
  if (duplicates.length) {
    await db.insert(seoDuplicates).values(duplicates)
  }

  // Detect canonical chains
  const chains = detectCanonicalChains(canonicalMap)
  if (chains.length) {
    await db.insert(canonicalChains).values(
      chains.map(c => ({ scanId, ...c }))
    )
  }

  // Insert link text issues
  await db.insert(linkTextIssues).values(
    Array.from(linkTextMap.entries()).map(([text, data]) => ({
      scanId,
      text,
      instanceCount: data.count,
      pageCount: data.pages.length,
      pages: JSON.stringify(data.pages),
    }))
  )
}

function detectCanonicalChains(
  canonicalMap: Map<string, string>
): Array<{ chainType: string, pages: string, finalTarget: string }> {
  const chains: Array<{ chainType: string, pages: string, finalTarget: string }> = []
  const visited = new Set<string>()

  for (const [start] of canonicalMap) {
    if (visited.has(start))
      continue

    const chain = [start]
    let current = start
    let isLoop = false

    while (canonicalMap.has(current)) {
      const next = canonicalMap.get(current)!
      if (chain.includes(next)) {
        isLoop = true
        break
      }
      chain.push(next)
      current = next
    }

    if (chain.length > 2 || isLoop) {
      chains.push({
        chainType: isLoop ? 'loop' : 'chain',
        pages: JSON.stringify(chain),
        finalTarget: isLoop ? chain[0] : chain[chain.length - 1],
      })
    }

    chain.forEach(p => visited.add(p))
  }

  return chains
}
```

---

## Dashboard Summary JSON

Stored in `dashboardSummaries.seoSummary`:

```typescript
interface SeoSummary {
  avgScore: number
  pageCount: number

  indexability: {
    indexable: number
    blockedByRobots: number
    noindex: number
  }

  titles: {
    valid: number
    missing: number
    duplicate: number
    tooShort: number
    tooLong: number
  }

  metaDescriptions: {
    valid: number
    missing: number
    duplicate: number
    tooShort: number
    tooLong: number
  }

  canonicals: {
    selfReferencing: number
    pointsToOther: number
    missing: number
    chains: number
    loops: number
  }

  structuredData: {
    coverage: number
    schemaTypes: Record<string, number>
  }

  socialMeta: {
    ogCoverage: number
    twitterCoverage: number
  }

  linkTextIssues: number
  tapTargetIssues: number
}
```

---

## Length Thresholds Reference

| Element | Too Short | Optimal | Too Long |
|---------|-----------|---------|----------|
| Title | <30 chars | 30-60 chars | >60 chars |
| Meta Description | <70 chars | 70-160 chars | >160 chars |

---

## Social Meta Checklist

**Open Graph (minimum):**
- og:title
- og:description
- og:image
- og:url
- og:type

**Twitter Cards (minimum):**
- twitter:card
- twitter:title
- twitter:description
- twitter:image
