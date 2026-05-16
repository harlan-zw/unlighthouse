// `a11y-quick-wins` pack — D-028. Sitewide accessibility violation rollup
// with copy-paste-ready fix suggestions.
//
// The pack reads any Lighthouse audit that ships under the `accessibility`
// category and is `score < 1` on at least one route. It does NOT hardcode
// a fixed audit list: Lighthouse's a11y category is the source of truth,
// so new axe-core rules added upstream surface automatically.
//
// Cross-route join: violations are keyed on (auditId + selector). The same
// `<button>` missing an accessible name on 18 routes becomes ONE finding
// with `routeCount: 18`. The wire payload includes up to five sample
// routes per finding.
//
// Severity is derived from the audit's weight on the accessibility
// category (Lighthouse's own importance signal): 10 → critical, 7 → serious,
// 3-6 → moderate, ≤2 → minor. Weight zero means "informational" — those
// audits are kept but bucketed minor.

import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts'
import { z } from 'zod'

// ── Report shape ────────────────────────────────────────────────────────────

const SeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])

const AffectedElementSchema = z.object({
  selector: z.string(),
  snippet: z.string().nullable(),
  nodeLabel: z.string().nullable(),
  // The first route URL on which this element was seen. Useful for the
  // "view in context" affordance later.
  firstSeenOn: z.string(),
})

const A11yFindingSchema = z.object({
  auditId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  severity: SeveritySchema,
  // Lighthouse a11y category weight (the source of severity).
  weight: z.number().int().nonnegative(),
  // Number of unique elements (selector) that violate this rule, across
  // the whole site. NOT the same as routeCount — one route can have
  // multiple violating elements.
  elementCount: z.number().int().nonnegative(),
  // Unique routes that flagged this rule.
  routeCount: z.number().int().nonnegative(),
  routes: z.array(z.string()).max(5),
  // Top 3 affected elements for orientation. The agent / UI drills into
  // raw LHR if it needs the full list.
  topElements: z.array(AffectedElementSchema).max(3),
  // One-line copy-paste hint for the fix. Audit-keyed; falls back to the
  // audit's own description when we don't have a hand-written tip.
  fixHint: z.string().nullable(),
})

const A11yReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  // Total violation instances across the site (sum of routeCount × element
  // hits — gives "X total fails", the agent's headline number).
  totalViolations: z.number().int().nonnegative(),
  severityCounts: z.object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  findings: z.array(A11yFindingSchema),
})

export type A11yFinding = z.infer<typeof A11yFindingSchema>
export type A11yReport = z.infer<typeof A11yReportSchema>

// ── Helpers ─────────────────────────────────────────────────────────────────

interface LhrLike {
  categories?: {
    accessibility?: {
      auditRefs?: Array<{ id: string, weight: number }>
    }
  }
  audits?: Record<string, {
    id?: string
    title?: string
    description?: string
    score?: number | null
    scoreDisplayMode?: string
    details?: {
      items?: Array<{
        node?: { selector?: string, snippet?: string, nodeLabel?: string }
      }>
    }
  }>
}

function severityFromWeight(weight: number): A11yFinding['severity'] {
  if (weight >= 10)
    return 'critical'
  if (weight >= 7)
    return 'serious'
  if (weight >= 3)
    return 'moderate'
  return 'minor'
}

// Audit-id → human fix hint. Covers the common WCAG quick-wins; absent
// audits fall back to the LHR's own description, which is usually OK but
// less actionable.
const FIX_HINTS: Record<string, string> = {
  'image-alt': 'Add an `alt` attribute. Use an empty `alt=""` for decorative images so screen readers skip them.',
  'color-contrast': 'Increase contrast to at least 4.5:1 (3:1 for large text). Pick the closest WCAG-compliant shade in your design system.',
  'label': 'Wrap the input in a `<label>`, or give it an `aria-label` / `aria-labelledby` referencing visible text.',
  'button-name': 'Give the button visible text, or add `aria-label="…"` describing the action.',
  'link-name': 'Make the link text describe its destination. Replace icon-only links with text or `aria-label`.',
  'html-has-lang': 'Set `<html lang="en">` (or your site\'s primary language).',
  'meta-viewport': 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">`. Don\'t set `user-scalable=no`.',
  'document-title': 'Add a unique `<title>` element to every route. Lead with the page name.',
  'aria-valid-attr-value': 'Check the offending element\'s ARIA attribute against the WAI-ARIA spec — usually a typo or stale value.',
  'aria-valid-attr': 'Remove the unsupported ARIA attribute or fix the typo.',
  'aria-allowed-attr': 'The ARIA attribute is allowed only on certain roles; either change the role or drop the attribute.',
  'aria-hidden-body': 'Remove `aria-hidden="true"` from `<body>` — it hides every page from assistive tech.',
  'aria-hidden-focus': 'Focusable descendants of an `aria-hidden="true"` ancestor are inaccessible. Move focus or expose them.',
  'aria-conditional-attr': 'Ensure ARIA attributes match the element\'s role per spec.',
  'aria-prohibited-attr': 'The element\'s role prohibits this ARIA attribute. Remove it or change the role.',
  'tabindex': 'Avoid `tabindex` values greater than 0; they reorder the tab sequence and confuse users. Use 0 or -1.',
  'duplicate-id-aria': 'IDs referenced by `aria-labelledby` / `aria-describedby` must be unique. Rename duplicates.',
  'duplicate-id-active': 'Two focusable elements share the same `id`. Make them unique.',
  'frame-title': 'Every `<iframe>` needs a `title` attribute that describes its content.',
  'valid-lang': 'Use a valid BCP 47 language code in `lang=` (e.g. `en`, `en-GB`, `tr`).',
  'video-caption': 'Provide captions via a `<track kind="captions">` child on every `<video>`.',
}

interface RawFinding {
  auditId: string
  title: string
  description: string | null
  weight: number
  // Keyed by selector → element data. One element per selector — we don't
  // dedupe across routes here because the *same* element on multiple routes
  // is genuinely useful information for the affected-routes count.
  elements: Map<string, {
    selector: string
    snippet: string | null
    nodeLabel: string | null
    firstSeenOn: string
    routes: Set<string>
  }>
}

// ── Reconciler ──────────────────────────────────────────────────────────────

// D-029 + reconciled-details: per-route view as it lands from either substrate
// (reconciled blob first, LHR fallback). Element-level data was projected
// into the reconciled blob in this PR — earlier scans without that
// projection still work via getLhr.
interface RouteView {
  // (auditId → { weight, title, description, items })
  audits: Map<string, {
    weight: number
    title: string
    description: string | null
    items: Array<{ selector: string | null, snippet: string | null, nodeLabel: string | null }>
    failed: boolean
  }>
}

async function loadRouteView(url: string, ctx: PackReconcileCtx): Promise<RouteView | null> {
  // Prefer reconciled. Returns null on miss so we drop through to the LHR
  // path — keeps older scans working without re-ingesting them.
  if (ctx.getReconciled) {
    const reconciled = await ctx.getReconciled(url, 'mobile').catch(() => null) as
      | { categories?: { accessibility?: { auditRefs?: Array<{ id: string, weight: number }> } }
        , audits?: Record<string, {
          score: number | null
          title: string | null
          description: string | null
          items: Array<{ node?: { selector: string | null, snippet: string | null, nodeLabel: string | null } | null }> | null
        }> }
      | null
    if (reconciled?.audits && reconciled.categories?.accessibility?.auditRefs?.length) {
      const audits = new Map<string, RouteView['audits'] extends Map<string, infer V> ? V : never>()
      const weights = new Map<string, number>()
      for (const ref of reconciled.categories.accessibility.auditRefs)
        weights.set(ref.id, ref.weight)
      for (const [id, weight] of weights) {
        const a = reconciled.audits[id]
        if (!a)
          continue
        const failed = a.score != null && a.score < 1
        const items: RouteView['audits'] extends Map<string, infer V> ? V['items'] : never = []
        if (failed && a.items) {
          for (const it of a.items) {
            const node = it.node
            if (!node)
              continue
            items.push({
              selector: node.selector,
              snippet: node.snippet,
              nodeLabel: node.nodeLabel,
            })
          }
        }
        audits.set(id, {
          weight,
          title: a.title ?? id,
          description: a.description,
          items,
          failed,
        })
      }
      return { audits }
    }
  }
  // LHR fallback.
  if (ctx.getLhr) {
    const lhr = await ctx.getLhr(url, 'mobile').catch(() => null) as LhrLike | null
    if (!lhr?.audits || !lhr.categories?.accessibility?.auditRefs)
      return null
    const audits = new Map<string, RouteView['audits'] extends Map<string, infer V> ? V : never>()
    for (const ref of lhr.categories.accessibility.auditRefs) {
      const a = lhr.audits[ref.id]
      if (!a)
        continue
      const failed = a.score != null && a.score < 1
      const items: RouteView['audits'] extends Map<string, infer V> ? V['items'] : never = []
      if (failed) {
        for (const it of a.details?.items ?? []) {
          const node = it.node
          if (!node)
            continue
          items.push({
            selector: node.selector ?? null,
            snippet: node.snippet ?? null,
            nodeLabel: node.nodeLabel ?? null,
          })
        }
      }
      audits.set(ref.id, {
        weight: ref.weight,
        title: a.title ?? ref.id,
        description: a.description ?? null,
        items,
        failed,
      })
    }
    return { audits }
  }
  return null
}

async function reconcile(ctx: PackReconcileCtx): Promise<A11yReport> {
  if (!ctx.getReconciled && !ctx.getLhr) {
    throw new Error('a11y-quick-wins pack requires getReconciled or getLhr (both PackReconcileCtx fetchers were undefined).')
  }

  const findings = new Map<string, RawFinding>()
  let routesAnalysed = 0

  for (const row of ctx.routes) {
    const view = await loadRouteView(row.url, ctx)
    if (!view)
      continue
    routesAnalysed++

    for (const [auditId, audit] of view.audits) {
      if (!audit.failed || audit.items.length === 0)
        continue

      let finding = findings.get(auditId)
      if (!finding) {
        finding = {
          auditId,
          title: audit.title,
          description: audit.description,
          weight: audit.weight,
          elements: new Map(),
        }
        findings.set(auditId, finding)
      }

      for (const it of audit.items) {
        const selector = it.selector ?? '(no selector)'
        const existing = finding.elements.get(selector)
        if (existing) {
          existing.routes.add(row.url)
        }
        else {
          finding.elements.set(selector, {
            selector,
            snippet: it.snippet,
            nodeLabel: it.nodeLabel,
            firstSeenOn: row.url,
            routes: new Set([row.url]),
          })
        }
      }
    }
  }

  // Materialise into the wire shape.
  const result: A11yFinding[] = [...findings.values()].map((f) => {
    const elementsArr = [...f.elements.values()]
    const routes = new Set<string>()
    for (const e of elementsArr)
      for (const r of e.routes)
        routes.add(r)
    const routesArr = [...routes]
    return {
      auditId: f.auditId,
      title: f.title,
      description: f.description,
      severity: severityFromWeight(f.weight),
      weight: f.weight,
      elementCount: elementsArr.length,
      routeCount: routesArr.length,
      routes: routesArr.slice(0, 5),
      topElements: elementsArr.slice(0, 3).map(e => ({
        selector: e.selector,
        snippet: e.snippet,
        nodeLabel: e.nodeLabel,
        firstSeenOn: e.firstSeenOn,
      })),
      fixHint: FIX_HINTS[f.auditId] ?? null,
    }
  })

  // Sort: severity (critical → minor), then by routeCount × elementCount
  // (impact-by-surface-area) so the biggest fix-once-fix-everywhere wins
  // land at the top.
  const severityRank: Record<A11yFinding['severity'], number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  }
  result.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity])
      return severityRank[a.severity] - severityRank[b.severity]
    return (b.routeCount * b.elementCount) - (a.routeCount * a.elementCount)
  })

  const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  let totalViolations = 0
  for (const f of result) {
    severityCounts[f.severity]++
    totalViolations += f.elementCount
  }

  return {
    scanId: ctx.scanId,
    routesAnalysed,
    totalViolations,
    severityCounts,
    findings: result,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const a11yQuickWinsPack: Pack<A11yReport> = {
  name: 'a11y-quick-wins',
  description: 'Sitewide accessibility violations grouped by rule, with affected-element samples and copy-paste fix hints. Severity from Lighthouse weight.',
  version: '1.0.0',
  // No specific auditor requirements — every Lighthouse run produces the
  // accessibility category by default.
  auditors: [
    { kind: 'lh-category', id: 'accessibility', required: true },
  ],
  reconciler: reconcile,
  reportSchema: A11yReportSchema,
}
