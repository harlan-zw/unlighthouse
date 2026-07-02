// `best-practices` pack — D-045. Per-route best-practices health-check.
//
// Reads every audit under the Lighthouse `best-practices` category (same
// source-of-truth pattern as `seo-basics` / `a11y-quick-wins`). Failing,
// actionable audits (score < 1, excluding informative/notApplicable/manual —
// those never carry a numeric score so they're already excluded by the
// score !== null check) land in `findings`, keyed by audit id, with the
// routes that flagged them and a copy-paste fix hint.
//
// Replaces the UI's `best-practices.vue` client-side `route.audits` fan-out
// (O(routes) requests) — this pack is the one reconciler-shaped source of
// truth for the category, matching `seo-basics` and `a11y-quick-wins`.

import type { BestPracticesFinding, BestPracticesReport, Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { Device } from '@unlighthouse/contracts/types/atoms'
import { BestPracticesReportSchema } from '@unlighthouse/contracts/packs'
import { resolveDistinctPackRoutes } from './reconcile-context'

// ── Helpers ─────────────────────────────────────────────────────────────────

interface LhrLike {
  categories?: {
    'best-practices'?: {
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

// weight → severity, mirroring seo-basics' severityFromWeight. Most
// best-practices audits are weight 1; a handful of security checks
// (has-hsts, csp-xss, trusted-types-xss) come in heavier.
function severityFromWeight(weight: number): BestPracticesFinding['severity'] {
  if (weight >= 3)
    return 'critical'
  if (weight >= 1)
    return 'serious'
  if (weight > 0)
    return 'moderate'
  return 'minor'
}

// Hand-written fix hints. Falls back to the audit's `description` field
// when an audit id isn't covered.
const FIX_HINTS: Record<string, string> = {
  'is-on-https': 'Serve every resource over HTTPS — mixed content blocks modern APIs and browsers flag it as insecure.',
  'redirects-http': 'Redirect HTTP → HTTPS at the edge (301) so the first request never round-trips over plaintext.',
  'geolocation-on-start': 'Request `navigator.geolocation` from a user gesture, not on page load — unsolicited prompts get auto-denied.',
  'notification-on-start': 'Request Notification permission from a user gesture, not on page load.',
  'csp-xss': 'Add a `Content-Security-Policy` header that restricts script sources — mitigates XSS from injected scripts.',
  'has-hsts': 'Add `Strict-Transport-Security` with a long `max-age` so browsers never downgrade to HTTP.',
  'origin-isolation': 'Add `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers to isolate the origin.',
  'clickjacking-mitigation': 'Add `X-Frame-Options` or a `frame-ancestors` CSP directive to prevent clickjacking.',
  'trusted-types-xss': 'Adopt a Trusted Types CSP policy to block DOM-XSS sinks at the browser level.',
  'paste-preventing-inputs': 'Remove `onpaste` handlers that block pasting into password/input fields.',
  'image-aspect-ratio': 'Set explicit `width`/`height` (or `aspect-ratio`) matching the natural image ratio to avoid a distorted render.',
  'image-size-responsive': 'Serve images sized for their rendered dimensions — avoid shipping a much larger source than displayed.',
  'doctype': 'Add `<!DOCTYPE html>` as the first line — its absence triggers quirks mode.',
  'charset': 'Declare `<meta charset="utf-8">` within the first 1024 bytes of the document.',
  'deprecations': 'Remove calls to deprecated / soon-to-be-removed browser APIs flagged in the console.',
  'third-party-cookies': 'Migrate third-party cookie usage to the Storage Access API or a first-party alternative before browsers phase them out.',
  'errors-in-console': 'Fix the errors logged to the console during page load — each one is a real runtime failure, not noise.',
  'inspector-issues': 'Resolve the issues flagged in Chrome DevTools\' Issues panel (CORS, quirks-mode, deprecations, etc.).',
  'js-libraries': 'Upgrade JS libraries with known vulnerabilities to a patched version.',
  'valid-source-maps': 'Ship valid source maps for production JS so errors are debuggable without exposing broken maps.',
}

const CATEGORY = 'best-practices' as const

interface RawFinding {
  auditId: string
  title: string
  description: string | null
  weight: number
  routes: Set<string>
  sampleElements: Array<{
    selector: string | null
    snippet: string | null
    nodeLabel: string | null
  }>
}

// Per-route view of just the best-practices bits this pack needs. Sourced
// from the reconciled blob first (LH-version stable; best-practices audits
// are in the PROJECTED_DETAIL_AUDITS allowlist so `items` already carries
// node-level detail where Lighthouse provides it), raw LHR as fallback for
// older scans that predate the reconciled blob.
interface RouteView {
  audits: Record<string, { score: number | null, title: string | null, description: string | null, items: Array<{ selector: string | null, snippet: string | null, nodeLabel: string | null }> | null }>
  auditWeights: Map<string, number>
  rawLhr: LhrLike | null
}

async function loadRouteView(url: string, device: Device, ctx: PackReconcileCtx): Promise<RouteView | null> {
  const reconciled = ctx.getReconciled
    ? await ctx.getReconciled(url, device).catch((err) => {
        ctx.logger?.debug?.(`best-practices pack: failed to load reconciled report for ${url} [${device}]`, err)
        return null
      })
    : null
  const lhr = ctx.getLhr
    ? await ctx.getLhr(url, device).catch((err) => {
      ctx.logger?.debug?.(`best-practices pack: failed to load LHR for ${url} [${device}]`, err)
      return null
    }) as LhrLike | null
    : null

  if (!reconciled && !lhr)
    return null

  const audits: RouteView['audits'] = {}
  const auditWeights = new Map<string, number>()

  if (reconciled) {
    for (const ref of reconciled.categories[CATEGORY]?.auditRefs ?? [])
      auditWeights.set(ref.id, ref.weight)
    for (const [id, a] of Object.entries(reconciled.audits)) {
      audits[id] = {
        score: a.score,
        title: a.title,
        description: a.description,
        items: a.items?.map(it => ({
          selector: it.node?.selector ?? null,
          snippet: it.node?.snippet ?? null,
          nodeLabel: it.node?.nodeLabel ?? null,
        })) ?? null,
      }
    }
  }
  else if (lhr) {
    for (const ref of lhr.categories?.[CATEGORY]?.auditRefs ?? [])
      auditWeights.set(ref.id, ref.weight)
    for (const [id, a] of Object.entries(lhr.audits ?? {})) {
      audits[id] = {
        score: a.score ?? null,
        title: a.title ?? null,
        description: a.description ?? null,
        items: null,
      }
    }
  }

  return { audits, auditWeights, rawLhr: lhr }
}

// ── Reconciler ──────────────────────────────────────────────────────────────

async function reconcile(ctx: PackReconcileCtx): Promise<BestPracticesReport> {
  if (!ctx.getReconciled && !ctx.getLhr) {
    throw new Error('best-practices pack requires getReconciled or getLhr (both PackReconcileCtx fetchers were undefined).')
  }

  const findings = new Map<string, RawFinding>()
  let routesAnalysed = 0

  for (const { url, device } of resolveDistinctPackRoutes(ctx.routes)) {
    const view = await loadRouteView(url, device, ctx)
    if (!view || view.auditWeights.size === 0)
      continue
    routesAnalysed++

    for (const [auditId, weight] of view.auditWeights) {
      const audit = view.audits[auditId]
      if (!audit)
        continue
      const score = audit.score
      // notApplicable / manual / informative audits carry no numeric score —
      // neither pass nor fail, mirrors the UI's `a.score === null` skip.
      if (score == null || score >= 1)
        continue

      let finding = findings.get(auditId)
      if (!finding) {
        finding = {
          auditId,
          title: audit.title ?? auditId,
          description: audit.description,
          weight,
          routes: new Set(),
          sampleElements: [],
        }
        findings.set(auditId, finding)
      }
      finding.routes.add(url)

      // Prefer the reconciled projection's items (already node-shaped);
      // fall back to raw LHR detail items for older scans.
      const rawAudit = view.rawLhr?.audits?.[auditId]
      const sourceItems = audit.items ?? (rawAudit?.details?.items ?? []).map(it => ({
        selector: it.node?.selector ?? null,
        snippet: it.node?.snippet ?? null,
        nodeLabel: it.node?.nodeLabel ?? null,
      }))
      for (const item of sourceItems) {
        if (finding.sampleElements.length >= 3)
          break
        if (item.selector == null && item.snippet == null && item.nodeLabel == null)
          continue
        if (finding.sampleElements.some(e => e.selector === item.selector))
          continue
        finding.sampleElements.push(item)
      }
    }
  }

  const result: BestPracticesFinding[] = [...findings.values()].map((f) => {
    const routesArr = [...f.routes]
    return {
      auditId: f.auditId,
      title: f.title,
      description: f.description,
      severity: severityFromWeight(f.weight),
      weight: f.weight,
      routeCount: routesArr.length,
      routes: routesArr.slice(0, 5),
      sampleElements: f.sampleElements,
      fixHint: FIX_HINTS[f.auditId] ?? f.description ?? 'See the Lighthouse audit description for details.',
    }
  })

  const severityRank: Record<BestPracticesFinding['severity'], number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  }
  result.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity])
      return severityRank[a.severity] - severityRank[b.severity]
    return b.routeCount - a.routeCount
  })

  const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const f of result)
    severityCounts[f.severity]++

  return {
    scanId: ctx.scanId,
    routesAnalysed,
    severityCounts,
    findings: result,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const bestPracticesPack: Pack<BestPracticesReport> = {
  name: 'best-practices',
  description: 'Sitewide best-practices checklist: HTTPS/security headers, console errors, deprecated APIs, image sizing. Failing audits grouped by rule.',
  version: '1.0.0',
  auditors: [
    { kind: 'lh-category', id: 'best-practices', required: true },
  ],
  reconciler: reconcile,
  reportSchema: BestPracticesReportSchema,
  ui: { tab: 'Best Practices', icon: 'shield-check' },
}
