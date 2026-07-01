// @unlighthouse/pack-nuxt
//
// A Nuxt-aware pack, and the reference implementation for authoring a
// third-party Unlighthouse pack. It depends ONLY on the pack contract
// (`@unlighthouse/contracts/packs`) — a pack is a reconciler + a report schema,
// not a fork of core.
//
// What it does: for every route in a finished scan it reads the reconciled
// report (the lean, version-stable projection packs consume) and rewrites the
// generic Lighthouse findings that fire into Nuxt-idiomatic fixes — e.g.
// `modern-image-formats` → "use <NuxtImg> from @nuxt/image". Findings are
// aggregated across routes so you get one entry per problem with the affected
// route list, not N copies.
//
// Register it on a host:
//   createUnlighthouseHost({ userConfig, packs: [nuxtPack] })
// or with the core factory directly:
//   createUnlighthouseCore({ ...ports, packs: [nuxtPack] })
// then `pack.run({ scanId, pack: 'nuxt' })`.

import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { AuditFinding, ReconciledReport } from '@unlighthouse/contracts/types/atoms'
import { z } from 'zod'

// ── Report shape (the pack owns its own schema) ──────────────────────────────

const NuxtSavingsSchema = z.object({
  LCP: z.number().optional(),
  FCP: z.number().optional(),
  INP: z.number().optional(),
  CLS: z.number().optional(),
  TBT: z.number().optional(),
})

const NuxtFindingSchema = z.object({
  /** Lighthouse audit id that fired (e.g. `modern-image-formats`). */
  auditId: z.string(),
  /** Human label from the LHR, when present. */
  title: z.string().nullable(),
  /** The Nuxt-idiomatic remediation. */
  fix: z.string(),
  /** Nuxt module this fix leans on, if any (e.g. `@nuxt/image`). */
  module: z.string().nullable(),
  /** Docs pointer for the fix. */
  docsUrl: z.string().nullable(),
  /** Worst severity seen across affected routes. */
  severity: z.enum(['warn', 'fail']),
  /** How many audited routes this finding affects. */
  routeCount: z.number().int(),
  /** Affected route URLs, capped at 10. */
  routes: z.array(z.string()),
  /** Summed estimated metric savings across affected routes, if Lighthouse gave any. */
  estimatedSavings: NuxtSavingsSchema.nullable(),
})

export const NuxtReportSchema = z.object({
  scanId: z.string(),
  /** True when a Nuxt stack pack was detected in at least one route's report. */
  nuxtDetected: z.boolean(),
  routesAnalysed: z.number().int(),
  /** Findings, most-affecting first. */
  findings: z.array(NuxtFindingSchema),
})

export type NuxtReport = z.infer<typeof NuxtReportSchema>
export type NuxtFinding = z.infer<typeof NuxtFindingSchema>

// ── Generic audit id → Nuxt fix ──────────────────────────────────────────────

interface FixRule {
  fix: string
  module: string | null
  docsUrl: string | null
}

const NUXT_FIX_MAP: Record<string, FixRule> = {
  'modern-image-formats': { fix: 'Serve AVIF/WebP via <NuxtImg>/<NuxtPicture> from @nuxt/image — it negotiates formats automatically.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com' },
  'uses-optimized-images': { fix: 'Let @nuxt/image compress and size images at request time with <NuxtImg>.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com' },
  'uses-responsive-images': { fix: 'Use <NuxtImg sizes> to emit a responsive srcset instead of shipping one large asset.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com/usage/nuxt-img#sizes' },
  'offscreen-images': { fix: 'Add loading="lazy" via <NuxtImg loading="lazy"> for below-the-fold images.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com' },
  'image-delivery-insight': { fix: 'Route hero and content images through @nuxt/image (<NuxtImg>) for automatic compression, format, and sizing.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com' },
  'prioritize-lcp-image': { fix: 'Mark the LCP image <NuxtImg preload fetchpriority="high"> so it is discovered early.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com/usage/nuxt-img#preload' },
  'lcp-discovery-insight': { fix: 'Preload the LCP image (<NuxtImg preload>) and avoid rendering it inside a lazily-hydrated component.', module: '@nuxt/image', docsUrl: 'https://image.nuxt.com/usage/nuxt-img#preload' },
  'render-blocking-resources': { fix: 'Move critical tags into useHead()/app.head and defer non-critical CSS/JS; Nuxt inlines critical styles by default — check features.inlineStyles.', module: null, docsUrl: 'https://nuxt.com/docs/api/composables/use-head' },
  'render-blocking-insight': { fix: 'Defer non-critical resources via useHead() and confirm inlineStyles is on so above-the-fold CSS ships inline.', module: null, docsUrl: 'https://nuxt.com/docs/api/composables/use-head' },
  'unused-javascript': { fix: 'Lazy-load heavy components (<LazyMyComp> / defineAsyncComponent) and enable payload extraction so unused JS is not shipped up front.', module: null, docsUrl: 'https://nuxt.com/docs/guide/directory-structure/components#dynamic-imports' },
  'legacy-javascript': { fix: 'Drop legacy transpilation targets in your build (nitro/vite build.target) — modern browsers do not need the polyfills.', module: null, docsUrl: 'https://nuxt.com/docs/api/nuxt-config#vite' },
  'duplicated-javascript': { fix: 'Deduplicate dependencies (single Vue/library version) and split shared chunks; check for duplicated deps across layers/modules.', module: null, docsUrl: 'https://nuxt.com/docs/api/nuxt-config#vite' },
  'uses-text-compression': { fix: 'Enable compression on the Nitro server (routeRules or compressPublicAssets) or at the edge.', module: null, docsUrl: 'https://nuxt.com/docs/guide/concepts/rendering#route-rules' },
  'server-response-time': { fix: 'Cache with Nitro routeRules (swr/isr) or prerender static routes so TTFB is served from cache, not rendered per request.', module: null, docsUrl: 'https://nuxt.com/docs/guide/concepts/rendering#hybrid-rendering' },
  'unused-css-rules': { fix: 'Scope styles and prune unused CSS; if using Tailwind/Nuxt UI, ensure content globs are tight.', module: null, docsUrl: 'https://nuxt.com/docs/getting-started/styling' },
  'document-title': { fix: 'Set titles with useSeoMeta()/useHead() (or @nuxtjs/seo defaults).', module: '@nuxtjs/seo', docsUrl: 'https://nuxtseo.com' },
  'meta-description': { fix: 'Set descriptions with useSeoMeta({ description }).', module: '@nuxtjs/seo', docsUrl: 'https://nuxt.com/docs/api/composables/use-seo-meta' },
  'canonical': { fix: 'Emit canonical links via @nuxtjs/seo (or useHead link).', module: '@nuxtjs/seo', docsUrl: 'https://nuxtseo.com' },
}

// LH savings keys are upper-cased on the finding; keep them as-is.
const SAVINGS_KEYS = ['LCP', 'FCP', 'INP', 'CLS', 'TBT'] as const

interface Agg {
  auditId: string
  title: string | null
  rule: FixRule
  severity: 'warn' | 'fail'
  routes: Set<string>
  savings: Record<string, number>
  hasSavings: boolean
}

function detectNuxt(report: ReconciledReport): boolean {
  return (report.stackPacks ?? []).some(sp =>
    /nuxt/i.test(sp.id) || /nuxt/i.test(sp.title),
  )
}

function worstSeverity(a: 'warn' | 'fail', b: AuditFinding['severity']): 'warn' | 'fail' {
  return a === 'fail' || b === 'fail' ? 'fail' : 'warn'
}

// ── The pack ─────────────────────────────────────────────────────────────────

export const nuxtPack: Pack<NuxtReport> = {
  name: 'nuxt',
  description: 'Nuxt-idiomatic fixes derived from Lighthouse findings across the scan.',
  version: '0.1.0',
  reportSchema: NuxtReportSchema,
  ui: { tab: 'Nuxt', icon: 'i-logos-nuxt-icon' },

  async reconciler(ctx: PackReconcileCtx): Promise<NuxtReport> {
    const device = ctx.routes[0]?.device ?? 'mobile'
    const byAudit = new Map<string, Agg>()
    let nuxtDetected = false
    let routesAnalysed = 0

    for (const route of ctx.routes) {
      let report: ReconciledReport | null = null
      if (ctx.getReconciled) {
        try {
          report = await ctx.getReconciled(route.url, device)
        }
        catch (err) {
          ctx.logger?.debug?.(`pack-nuxt: no reconciled report for ${route.url} [${device}]`, err)
        }
      }
      if (!report)
        continue
      routesAnalysed++
      if (detectNuxt(report))
        nuxtDetected = true

      for (const [auditId, rule] of Object.entries(NUXT_FIX_MAP)) {
        const audit = report.audits?.[auditId]
        // Only surface audits that actually fired (warn/fail). `pass`,
        // informative, and not-applicable audits are noise here.
        if (!audit || audit.severity === 'pass')
          continue

        let agg = byAudit.get(auditId)
        if (!agg) {
          agg = { auditId, title: audit.title, rule, severity: 'warn', routes: new Set(), savings: {}, hasSavings: false }
          byAudit.set(auditId, agg)
        }
        agg.severity = worstSeverity(agg.severity, audit.severity)
        agg.routes.add(route.url)
        agg.title ??= audit.title
        if (audit.metricSavings) {
          for (const key of SAVINGS_KEYS) {
            const v = audit.metricSavings[key]
            if (typeof v === 'number' && v > 0) {
              agg.savings[key] = (agg.savings[key] ?? 0) + v
              agg.hasSavings = true
            }
          }
        }
      }
    }

    const findings: NuxtFinding[] = [...byAudit.values()]
      .map(agg => ({
        auditId: agg.auditId,
        title: agg.title,
        fix: agg.rule.fix,
        module: agg.rule.module,
        docsUrl: agg.rule.docsUrl,
        severity: agg.severity,
        routeCount: agg.routes.size,
        routes: [...agg.routes].slice(0, 10),
        estimatedSavings: agg.hasSavings ? agg.savings : null,
      }))
      // Fails before warns, then by breadth of impact.
      .sort((a, b) =>
        (a.severity === b.severity ? 0 : a.severity === 'fail' ? -1 : 1)
        || b.routeCount - a.routeCount,
      )

    return {
      scanId: ctx.scanId,
      nuxtDetected,
      routesAnalysed,
      findings,
    }
  },
}

export default nuxtPack
