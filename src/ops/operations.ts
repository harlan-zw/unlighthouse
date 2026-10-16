import { z } from 'zod'
import { compareScans } from '../analysis/compare.ts'
import { budgetsSchema } from '../config.ts'
import { UnlighthouseError } from '../errors.ts'
import { isFinished } from '../scan/runner.ts'
import { CATEGORIES, DEVICES, METRICS } from '../types.ts'
import { analyzeScan, budgetReport, getScan, loadSide, meanScores, publicScan, scanBudgets } from './analysis.ts'
import { monitoringOperations } from './monitoring.ts'
import type { AnyOperation } from './registry.ts'
import { defineOperation } from './registry.ts'

const device = z.enum(DEVICES)
const category = z.enum(CATEGORIES)
const scanStatus = z.enum(['queued', 'discovering', 'auditing', 'done', 'cancelled', 'failed'])
const pageStatus = z.enum(['queued', 'running', 'done', 'failed', 'skipped'])
const scanId = z.string().min(1).describe('Scan id, from scans.list, scans.start or sites.list (lastScan.id)')
const limit = (fallback: number, max: number) => z.number().int().min(1).max(max).default(fallback).describe(`Page size, at most ${max}`)
const offset = z.number().int().min(0).default(0).describe('Number of rows to skip')

export const scanSchema = z.object({
  id: z.string(),
  siteId: z.number(),
  origin: z.string(),
  status: scanStatus,
  label: z.string().nullable(),
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  devices: z.array(device),
  options: z.unknown().describe('Frozen, resolved config of the scan (auth values redacted)'),
  stats: z.object({
    discovered: z.number().describe('Unique URLs found'),
    queued: z.number().describe('URL x device audits still waiting or running'),
    done: z.number(),
    failed: z.number(),
    skipped: z.number().describe('URL x device pairs left out by sampling or cancellation'),
  }),
  lighthouseVersion: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
})

export const startInput = z.object({
  site: z.url({ protocol: /^https?$/ }).describe('URL to scan, e.g. https://example.com. Discovery starts here and stays on its origin.'),
  devices: z.array(device).min(1).optional().describe('Devices to audit every page on; default from config (mobile)'),
  categories: z.array(category).min(1).optional().describe('Lighthouse categories; default all five'),
  throttling: z.enum(['simulate', 'devtools', 'none']).optional(),
  concurrency: z.number().int().min(1).max(32).optional().describe('Parallel Lighthouse runs; leave unset for stable performance scores'),
  samples: z.number().int().min(1).max(9).optional().describe('Runs per page; the median run is kept'),
  timeoutMs: z.number().int().min(10_000).optional(),
  retries: z.number().int().min(0).max(5).optional(),
  urls: z.array(z.string()).optional().describe('Explicit paths or URLs to audit; skips discovery'),
  templates: z.array(z.string()).optional().describe('Known URL patterns such as /blog/:slug'),
  userAgent: z.string().optional(),
  discover: z.object({
    robots: z.boolean().optional(),
    sitemap: z.boolean().optional(),
    links: z.boolean().optional(),
    render: z.boolean().optional().describe('Render pages in Chrome before reading links (client-rendered sites)'),
    maxPages: z.number().int().min(1).optional(),
    maxDepth: z.number().int().min(0).optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    keepQuery: z.array(z.string()).optional(),
    locales: z.union([z.enum(['default', 'all']), z.array(z.string().min(1)).min(1)]).optional()
      .describe('Languages to audit on multilingual sites: default (primary language only), all, or locale codes such as ["en", "tr"]'),
  }).optional(),
  sampling: z.object({
    perTemplate: z.number().int().min(0).optional().describe('Pages audited per template; 0 audits every page'),
    maxAudits: z.number().int().min(1).optional().describe('Upper bound on audited pages per device'),
  }).optional(),
  lighthouse: z.object({
    skipAudits: z.array(z.string().min(1)).optional().describe('Lighthouse audit ids to skip'),
    onlyAudits: z.array(z.string().min(1)).optional().describe('Run only these Lighthouse audits; category scores then cover only them'),
  }).optional().describe('Lighthouse audit filters. Plugins, settings and the runner come from the config file only.'),
  budgets: budgetsSchema.partial().optional(),
  label: z.string().max(200).optional(),
  branch: z.string().max(200).optional(),
  commit: z.string().max(200).optional(),
})

const pageKey = z.object({
  scanId,
  url: z.string().min(1).describe('Full page URL exactly as listed by pages.list'),
  device,
})

type Defined<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]: Defined<Exclude<T[K], undefined>> } : T

function dropUndefined<T extends Record<string, unknown>>(value: T): Defined<T> {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined)
      continue
    out[key] = item !== null && typeof item === 'object' && !Array.isArray(item) ? dropUndefined(item as Record<string, unknown>) : item
  }
  return out as Defined<T>
}

export const operations: AnyOperation[] = [
  defineOperation({
    name: 'sites.list',
    kind: 'read',
    description: 'Lists every site Unlighthouse has scanned, with its number of scans, its latest scan (any status) and lastScores: the mean category scores (0-1) per device from its latest finished scan. Start here when you do not know a scan id.',
    input: z.object({}),
    handler({ store }) {
      return store.listSites().map((site) => {
        const done = store.listScans({ origin: site.origin, status: 'done', limit: 1, offset: 0 }).items[0]
        return {
          ...site,
          lastScan: site.lastScan ? publicScan(site.lastScan) : null,
          lastScores: done ? meanScores(store.allPages(done.id), done.devices) : {},
        }
      })
    },
  }),

  defineOperation({
    name: 'scans.list',
    kind: 'read',
    description: 'Lists scans newest first as { items, total }, optionally for one origin (https://example.com) or one status. Use it to find the latest scan of a site or two scans to pass to compare.',
    input: z.object({
      origin: z.string().optional().describe('Site origin, e.g. https://example.com'),
      status: scanStatus.optional(),
      limit: limit(20, 200),
      offset,
    }),
    handler({ store }, input) {
      const page = store.listScans(dropUndefined(input))
      return { items: page.items.map(publicScan), total: page.total }
    },
  }),

  defineOperation({
    name: 'scans.start',
    kind: 'write',
    description: 'Queues a site-wide Lighthouse scan and returns the Scan immediately (status "queued"). Unlighthouse discovers pages (robots.txt, sitemaps, links), groups them into templates, audits a sample per template on every device, and stores the results. Only one scan runs at a time; others wait. A scan takes minutes: call scans.wait with the returned id, then scans.summary.',
    input: startInput,
    output: scanSchema,
    handler({ scanner }, input) {
      return publicScan(scanner.start(dropUndefined(input)))
    },
  }),

  defineOperation({
    name: 'scans.get',
    kind: 'read',
    description: 'Returns one Scan: status (queued, discovering, auditing, done, cancelled, failed), progress counters in stats, error when it failed, and the frozen options. Poll it, or use scans.wait, to follow a running scan.',
    input: z.object({ scanId }),
    output: scanSchema,
    handler({ store }, input) {
      return publicScan(getScan(store, input.scanId))
    },
  }),

  defineOperation({
    name: 'scans.wait',
    kind: 'read',
    description: 'Blocks until the scan finishes (done, failed or cancelled) or timeoutMs passes, then returns the Scan. If status is still queued/discovering/auditing, call it again. Use after scans.start or pages.rescan instead of polling scans.get.',
    input: z.object({
      scanId,
      timeoutMs: z.number().int().min(0).max(600_000).default(50_000).describe('Longest time to wait, in ms (default 50000)'),
    }),
    output: scanSchema,
    async handler({ scanner, signal }, input) {
      return publicScan(await scanner.wait(input.scanId, input.timeoutMs, signal))
    },
  }),

  defineOperation({
    name: 'scans.cancel',
    kind: 'write',
    description: 'Stops a queued or running scan (its Chrome processes are killed) and returns it with status "cancelled". Pages not yet audited become skipped; finished pages are kept.',
    input: z.object({ scanId }),
    output: scanSchema,
    async handler({ scanner }, input) {
      return publicScan(await scanner.cancel(input.scanId))
    },
  }),

  defineOperation({
    name: 'scans.delete',
    kind: 'write',
    description: 'Permanently deletes a finished scan with its pages, findings and stored Lighthouse reports. Returns { deleted: scanId }. Pending page rescans of it are stopped; a running scan must be cancelled first.',
    input: z.object({ scanId }),
    async handler({ store, scanner }, input) {
      const scan = getScan(store, input.scanId)
      if (!isFinished(scan))
        throw new UnlighthouseError('SCAN_ACTIVE', `Scan ${scan.id} is ${scan.status}; cancel it before deleting`)
      await scanner.cancel(scan.id).catch((error) => {
        if (!(error instanceof UnlighthouseError && error.code === 'SCAN_NOT_RUNNING'))
          throw error
      })
      store.deleteScan(scan.id)
      return { deleted: scan.id }
    },
  }),

  defineOperation({
    name: 'scans.summary',
    kind: 'read',
    description: 'The best first call for a finished scan: a small overview with page counts, mean/median scores and p75 lab metrics per device, the worst templates, the top issues by impact, site-wide checks (robots.txt, llms.txt, ai-catalog.json), reliability warnings, user flow steps (flows), and, when an earlier comparable scan exists, the change since that baseline. Drill down with issues.list, pages.list and pages.get.',
    input: z.object({ scanId }),
    handler({ store }, input) {
      return analyzeScan(store, input.scanId).summary
    },
  }),

  defineOperation({
    name: 'scans.field',
    kind: 'read',
    description: 'Chrome UX Report field data of a scan (collected when crux.enabled is set): origin-wide real-user p75 and good/needs-improvement/poor shares per device (with a weekly trend when crux.history is set), and per-page coverage: which page audits have URL-level data (source "url"), fall back to origin data ("origin") or have none (null). Field data covers the last 28 days of real Chrome users; it is not comparable one-to-one with the lab metrics. Returns null when no field data was collected.',
    input: z.object({ scanId }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.scanField(input.scanId)
    },
  }),

  defineOperation({
    name: 'scans.brokenLinks',
    kind: 'read',
    description: 'Lists links found during discovery that answered with an error: [{ url, status, from }] where from is the page linking to it.',
    input: z.object({ scanId }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.brokenLinks(input.scanId)
    },
  }),

  defineOperation({
    name: 'scans.hreflang',
    kind: 'read',
    description: 'Lists hreflang problems found during discovery: [{ url, hreflang, target, problem }] where url declares <link rel="alternate" hreflang> (or a sitemap xhtml:link) to target and problem is invalid-code, broken-target, redirected-target or missing-return-link (target does not link back to url).',
    input: z.object({ scanId }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.hreflangProblems(input.scanId)
    },
  }),

  defineOperation({
    name: 'scans.templates',
    kind: 'read',
    description: 'Lists the URL templates of a scan (e.g. /blog/*) with the number of distinct pages in each, largest first. Use the template values to filter pages.list and issues.list.',
    input: z.object({ scanId }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.templates(input.scanId)
    },
  }),

  defineOperation({
    name: 'pages.list',
    kind: 'read',
    description: 'Lists pages (one row per URL x device) of a scan as { items, total } with scores (0-1, null = not measured), lab metrics (ms; CLS unitless), template and status. Filter by device, template, status or a URL substring; sort by a category, a metric, url or template. Example: worst performance first = { sort: "performance", order: "asc", status: "done" }.',
    input: z.object({
      scanId,
      device: device.optional(),
      template: z.string().optional().describe('Exact template, from scans.templates'),
      status: pageStatus.optional(),
      search: z.string().optional().describe('Substring of the URL'),
      sort: z.enum([...CATEGORIES, ...METRICS, 'url', 'template']).optional(),
      order: z.enum(['asc', 'desc']).optional(),
      limit: limit(50, 500),
      offset,
    }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.listPages(dropUndefined(input))
    },
  }),

  defineOperation({
    name: 'pages.get',
    kind: 'read',
    description: 'Returns one page on one device with scores, metrics, provenance (Lighthouse version, throttling, concurrency, sample spread), findings (every failing audit, narrowed to the item it names, with estimated savings) and field: Chrome UX Report real-user data { source: "url" | "origin" | null, record } with p75 and good/needs-improvement/poor shares of LCP, INP, CLS, FCP and TTFB, or null when field data was not collected. source "origin" means the URL has too little traffic and the origin-wide data is shown instead.',
    input: pageKey,
    handler({ store }, input) {
      const page = store.getPage(input.scanId, input.url, input.device)
      if (!page)
        throw new UnlighthouseError('NOT_FOUND', `Page not found: ${input.url} (${input.device}) in scan ${input.scanId}. Call pages.list for exact URLs.`)
      return { ...page, findings: store.findings(input.scanId, input.url, input.device), field: store.pageField(input.scanId, input.url, input.device) }
    },
  }),

  defineOperation({
    name: 'pages.rescan',
    kind: 'write',
    description: 'Re-audits one page of a finished scan in place (for example after a fix) and returns the page with status "queued". The new result replaces the old one; follow it with pages.get.',
    input: pageKey,
    handler({ scanner }, input) {
      return scanner.rescanPage(input.scanId, input.url, input.device)
    },
  }),

  defineOperation({
    name: 'issues.list',
    kind: 'read',
    description: 'Lists site-wide issues as { items, total }: one issue per failing audit, merged across pages and resources, ranked by impact (affected pages x estimated savings; per page the largest resource saving counts). Each issue names its audit, affected page count, number of distinct resources (items) with the top few (topItems), devices, templates and example URLs. Filter by category, device or template.',
    input: z.object({
      scanId,
      category: category.optional(),
      device: device.optional(),
      template: z.string().optional(),
      limit: limit(20, 500),
      offset,
    }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.listIssues(dropUndefined(input))
    },
  }),

  defineOperation({
    name: 'issues.get',
    kind: 'read',
    description: 'Returns one issue as { issue, items, pages }: every resource the audit names (key, label, affected pages, savings) and every affected page with its largest saving. Take auditId from issues.list or scans.summary.',
    input: z.object({
      scanId,
      auditId: z.string().min(1),
    }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      const issue = store.listIssues({ scanId: input.scanId, auditId: input.auditId, limit: 1, offset: 0 }).items[0]
      if (!issue)
        throw new UnlighthouseError('NOT_FOUND', `Issue not found: ${input.auditId} in scan ${input.scanId}`)
      return { issue, items: store.issueItems(input.scanId, input.auditId), pages: store.issuePages(input.scanId, input.auditId) }
    },
  }),

  defineOperation({
    name: 'compare',
    kind: 'read',
    description: 'Diffs two scans of the same site: per-page score and metric changes beyond a noise threshold (regressed, improved, unchanged, added, removed, or failed when a page measured in base failed in head), mean score deltas per device and template, and issues that are new, fixed, persisting or unknown (gone from head, but a page it affected failed in head, so it may not be fixed). base is the older scan, head the newer one.',
    input: z.object({ base: scanId, head: scanId }),
    handler({ store }, input) {
      const base = getScan(store, input.base)
      const head = getScan(store, input.head)
      return compareScans(loadSide(store, base), loadSide(store, head))
    },
  }),

  defineOperation({
    name: 'budgets.check',
    kind: 'read',
    description: 'Evaluates performance budgets against a scan and its baseline: minimum mean scores, maximum lab metrics (site-wide and per template, scoped template:<match>/<device>), maximum score drop and maximum new issues. Uses the budgets the scan was started with unless budgets is given. Returns { passed, results, baseline } where each result names the rule, scope, actual value and limit.',
    input: z.object({ scanId, budgets: budgetsSchema.optional() }),
    handler({ store }, input) {
      const analysis = analyzeScan(store, input.scanId)
      const report = budgetReport(analysis, input.budgets ?? scanBudgets(analysis.scan))
      return { ...report, baseline: analysis.baseline?.id ?? null }
    },
  }),

  defineOperation({
    name: 'flows.list',
    kind: 'read',
    description: 'Lists the user flow runs of a scan (one per flow x device): status, error, start URL and every step with its mode (navigation, timespan, snapshot), scores, metrics and finding count. Timespan steps carry INP, TBT and CLS from real interactions; for timespan and snapshot steps a category score is the share of passed audits. Flows come from the config file only.',
    input: z.object({ scanId }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      return store.listFlowRuns(input.scanId)
    },
  }),

  defineOperation({
    name: 'flows.get',
    kind: 'read',
    description: 'Returns one user flow run with every step and its findings (failing audits narrowed to the item they name, with estimated savings). Take name and device from flows.list or scans.summary.',
    input: z.object({ scanId, name: z.string().min(1).describe('Flow name from flows.list'), device }),
    handler({ store }, input) {
      getScan(store, input.scanId)
      const run = store.getFlowRun(input.scanId, input.name, input.device)
      if (!run)
        throw new UnlighthouseError('NOT_FOUND', `Flow not found: ${input.name} (${input.device}) in scan ${input.scanId}. Call flows.list for the flows of this scan.`)
      return run
    },
  }),
  ...monitoringOperations(startInput),
]
