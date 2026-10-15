import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { closestMatch, installedAuditIds } from './audit/lighthouse.ts'
import { UnlighthouseError } from './errors.ts'
import { cronError } from './scan/cron.ts'
import { CATEGORIES, DEVICES, FIELD_METRICS, FLOW_METRICS, NOTIFICATION_EVENTS, NOTIFICATION_TYPES } from './types.ts'

const cookie = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
})

const scoreBudgets = z.partialRecord(z.enum(CATEGORIES), z.number().min(0).max(1))
const metricBudgets = z.partialRecord(z.enum(['fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb']), z.number().min(0))

export const templateBudgetSchema = z.object({
  match: z.string().min(1).describe('Template pattern (e.g. /blog/*) or path glob (e.g. /blog/**)'),
  device: z.enum(DEVICES).optional().describe('Only check this device; default every scanned device'),
  scores: scoreBudgets.default({}).describe('Minimum average score per category over the matching pages, 0-1'),
  metrics: metricBudgets.default({}).describe('Maximum value per lab metric on any matching page'),
})

export const budgetsSchema = z.object({
  scores: scoreBudgets.default({})
    .describe('Minimum average score per category, 0-1'),
  metrics: metricBudgets.default({})
    .describe('Maximum value per lab metric on any page (ms, CLS unitless)'),
  templates: z.array(templateBudgetSchema).default([])
    .describe('Score and metric budgets for the pages of one template or path glob'),
  regression: z.partialRecord(z.enum(CATEGORIES), z.number().min(0).max(1)).default({})
    .describe('Maximum allowed drop of the average category score against the baseline'),
  newIssues: z.number().int().min(0).optional()
    .describe('Maximum number of issues that are new since the baseline'),
  field: z.partialRecord(z.enum(FIELD_METRICS), z.number().min(0)).default({})
    .describe('Maximum CrUX field p75 per metric for the origin, per device (ms, CLS unitless); needs crux.enabled'),
  flows: z.record(z.string(), z.object({
    steps: z.object({
      scores: z.partialRecord(z.enum(CATEGORIES), z.number().min(0).max(1)).default({})
        .describe('Minimum score per category on every step that measures it'),
      metrics: z.partialRecord(z.enum(FLOW_METRICS), z.number().min(0)).default({})
        .describe('Maximum value per metric on every step that measures it (ms, CLS unitless)'),
    }).prefault({}),
  })).default({}).describe('Budgets per user flow name, checked on each of its steps'),
})

export const flowSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[^/\\]+$/, 'flow names cannot contain slashes').describe('Unique flow name'),
  module: z.string().min(1).describe('Module whose default export receives { flow, page, url, device } and drives the journey'),
  url: z.string().optional().describe('Start URL or path; defaults to site'),
  devices: z.array(z.enum(DEVICES)).min(1).optional().describe('Devices to run the flow on; defaults to devices'),
  timeoutMs: z.number().int().min(1000).optional().describe('Hard limit for the whole flow; defaults to timeoutMs'),
})

export const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

const auditIds = z.array(z.string().min(1))

function checkAuditIds(value: { skipAudits?: string[] | undefined, onlyAudits?: string[] | undefined, plugins?: string[] | undefined }, ctx: z.RefinementCtx): void {
  if (value.plugins?.length)
    return
  const known = installedAuditIds()
  const ids = new Set(known)
  for (const key of ['skipAudits', 'onlyAudits'] as const) {
    value[key]?.forEach((id, index) => {
      if (ids.has(id))
        return
      const match = closestMatch(id, known)
      ctx.addIssue({ code: 'custom', path: [key, index], message: `Unknown Lighthouse audit "${id}"${match ? `; did you mean "${match}"?` : ''}` })
    })
  }
}

export const lighthouseOptionsSchema = z.object({
  skipAudits: auditIds.optional().describe('Audit ids Lighthouse skips'),
  onlyAudits: auditIds.optional().describe('Run only these audits (Lighthouse --only-audits); category scores then cover only them'),
  plugins: z.array(z.string().min(1)).optional()
    .describe('Lighthouse plugin packages (lighthouse-plugin-*), resolved from the project directory. Plugins run their own code in every audit; install only ones you trust. Config file only.'),
  settings: z.record(z.string(), z.unknown()).optional()
    .describe('Merged into the Lighthouse config settings; Unlighthouse\'s own options (categories, throttling, userAgent) take precedence. Config file only.'),
}).superRefine(checkAuditIds)

export const runnerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('local') }),
  z.object({
    type: z.literal('psi'),
    apiKeyEnv: z.string().min(1).default('PSI_API_KEY').describe('Environment variable holding the PageSpeed Insights API key'),
    endpoint: z.url({ protocol: /^https?$/ }).default(PSI_ENDPOINT),
    maxRetries: z.number().int().min(0).max(10).default(3).describe('Retries after HTTP 429 before the page fails'),
    backoffMs: z.number().int().min(0).max(120_000).default(5_000).describe('First wait after HTTP 429; doubles on each retry unless Retry-After says otherwise'),
  }),
  z.object({
    type: z.literal('cdp'),
    endpoint: z.url({ protocol: /^(?:wss?|https?)$/ }).describe('Remote Chrome: ws(s):// browser WebSocket endpoint or http(s):// DevTools URL'),
    headers: z.record(z.string(), z.string()).default({}).describe('Headers sent when connecting, e.g. an API token'),
  }),
])

export const monitorId = z.string().regex(/^[\w.-]{1,64}$/, 'Use 1-64 letters, digits, ".", "_" or "-"')

export const cronSchema = z.string().trim().min(1).superRefine((cron, ctx) => {
  const error = cronError(cron)
  if (error)
    ctx.addIssue({ code: 'custom', message: error })
}).describe('5-field cron expression (minute hour day month weekday) or @hourly/@daily/@weekly/@monthly, in the server time zone; at least 15 minutes apart')

export const ENV_REF = /^env:([A-Za-z_]\w*)$/

export const secretRef = z.string().min(1).refine(value => ENV_REF.test(value) || /^https?:\/\/\S+$/.test(value), 'Use env:NAME to read it from an environment variable, or an http(s) URL')

export const scheduleConfigSchema = z.object({
  id: monitorId.optional().describe('Stable id; derived from site and cron when left out'),
  site: z.url({ protocol: /^https?$/ }),
  cron: cronSchema,
  devices: z.array(z.enum(DEVICES)).min(1).optional().describe('Devices to audit; default from the config'),
  overrides: z.record(z.string(), z.unknown()).optional().describe('Scan options for this schedule, same keys as scans.start'),
  enabled: z.boolean().default(true),
})

export const notificationConfigSchema = z.object({
  id: monitorId,
  type: z.enum(NOTIFICATION_TYPES),
  url: secretRef.describe('Webhook URL, preferably env:NAME so the secret stays out of the config'),
  secret: z.string().min(1).optional().describe('HMAC-SHA256 key for generic webhooks, preferably env:NAME'),
  on: z.array(z.enum(NOTIFICATION_EVENTS)).min(1).default(['scan-failed', 'regression', 'budget-failed']),
  sites: z.array(z.url({ protocol: /^https?$/ })).optional().describe('Only notify for these sites; all sites when left out'),
})

export const configSchema = z.object({
  site: z.url({ protocol: /^https?$/ }).optional().describe('Site to scan (http or https)'),
  devices: z.array(z.enum(DEVICES)).min(1).default(['mobile']),
  categories: z.array(z.enum(CATEGORIES)).min(1).default([...CATEGORIES]),
  throttling: z.enum(['simulate', 'devtools', 'none']).default('simulate')
    .describe('simulate: Lighthouse default; devtools: real throttling; none: raw machine speed'),
  concurrency: z.number().int().min(1).max(32).optional()
    .describe('Parallel Lighthouse runs; defaults to a value that keeps performance scores stable'),
  samples: z.number().int().min(1).max(9).default(1).describe('Runs per page; the median run is kept'),
  timeoutMs: z.number().int().min(10_000).default(90_000),
  retries: z.number().int().min(0).max(5).default(1),
  urls: z.array(z.string()).default([]).describe('Explicit paths or URLs; disables discovery when set'),
  discover: z.object({
    robots: z.boolean().default(true),
    sitemap: z.boolean().default(true),
    links: z.boolean().default(true),
    render: z.boolean().default(false).describe('Render pages in Chrome before reading links (client-rendered sites)'),
    maxPages: z.number().int().min(1).default(500),
    maxDepth: z.number().int().min(0).default(8),
    include: z.array(z.string()).default([]).describe('Path globs to keep, e.g. /blog/**'),
    exclude: z.array(z.string()).default([]).describe('Path globs to drop'),
    keepQuery: z.array(z.string()).default([]).describe('Query parameters that make a page distinct'),
    locales: z.union([z.enum(['default', 'all']), z.array(z.string().min(1)).min(1)]).default('default')
      .describe('Languages to audit on multilingual sites: default (primary/x-default language only; other language versions are listed as skipped alternates), all, or a list of locale codes such as ["en", "tr"]'),
  }).prefault({}),
  sampling: z.object({
    perTemplate: z.number().int().min(0).default(5).describe('Pages audited per template; 0 audits all'),
    maxAudits: z.number().int().min(1).default(300).describe('Upper bound on audited pages per device'),
  }).prefault({}),
  templates: z.array(z.string()).default([]).describe('Known URL patterns, e.g. /blog/:slug, used before inference'),
  auth: z.object({
    headers: z.record(z.string(), z.string()).default({}),
    cookies: z.array(cookie).default([]),
    localStorage: z.record(z.string(), z.string()).default({}),
    sessionStorage: z.record(z.string(), z.string()).default({}),
    login: z.string().optional().describe('Module whose default export logs in with a Puppeteer page'),
  }).prefault({}),
  budgets: budgetsSchema.prefault({}),
  crux: z.object({
    enabled: z.boolean().default(false).describe('Fetch Chrome UX Report field data (p75 LCP, INP, CLS, FCP, TTFB) after auditing'),
    apiKeyEnv: z.string().default('CRUX_API_KEY').describe('Environment variable holding the CrUX API key'),
    history: z.boolean().default(false).describe('Also fetch the weekly origin trend from the CrUX History API'),
  }).prefault({}),
  flows: z.array(flowSchema).default([])
    .refine(flows => new Set(flows.map(flow => flow.name)).size === flows.length, 'flow names must be unique')
    .describe('User flows run after the page audits; config file only'),
  userAgent: z.string().optional(),
  chromePath: z.string().optional(),
  chromeFlags: z.array(z.string()).default([]),
  lighthouse: lighthouseOptionsSchema.prefault({}),
  runner: runnerSchema.default({ type: 'local' })
    .describe('Where Lighthouse runs: local Chrome (default), the PageSpeed Insights API (psi) or a remote Chrome over CDP (cdp). Remote performance scores are not comparable with local lab runs.'),
  dataDir: z.string().default('.unlighthouse'),
  schedules: z.array(scheduleConfigSchema).optional().describe('Scans that `unlighthouse serve` runs on a cron schedule'),
  notifications: z.array(notificationConfigSchema).optional().describe('Webhook, Slack or Discord messages sent after scans'),
  publicUrl: z.url({ protocol: /^https?$/ }).optional().describe('Dashboard URL used for links in notifications'),
})

export type ConfigInput = z.input<typeof configSchema>
export type Config = z.output<typeof configSchema>
export type Budgets = z.output<typeof budgetsSchema>
export type TemplateBudget = z.output<typeof templateBudgetSchema>
export type LighthouseOptions = z.output<typeof lighthouseOptionsSchema>
export type RunnerConfig = z.output<typeof runnerSchema>
export type FlowConfig = z.output<typeof flowSchema>

export function defineConfig(config: ConfigInput): ConfigInput {
  return config
}

const CONFIG_FILES = ['unlighthouse.config.ts', 'unlighthouse.config.js', 'unlighthouse.config.mjs']

export async function loadConfigFile(cwd: string, file?: string): Promise<{ path: string | null, config: ConfigInput }> {
  const candidates = file ? [file] : CONFIG_FILES
  for (const candidate of candidates) {
    const path = resolve(cwd, candidate)
    if (!existsSync(path)) {
      if (file)
        throw new UnlighthouseError('INVALID_CONFIG', `Config file not found: ${path}`)
      continue
    }
    const mod = await import(path)
    return { path, config: (mod.default ?? {}) as ConfigInput }
  }
  return { path: null, config: {} }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergeConfig<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined)
      continue
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeConfig(out[key] as Record<string, unknown>, value) : value
  }
  return out as T
}

export function parseConfig(input: unknown): Config {
  const result = configSchema.safeParse(input)
  if (!result.success)
    throw new UnlighthouseError('INVALID_CONFIG', z.prettifyError(result.error), result.error.issues)
  return result.data
}

export function defaultConcurrency(cpus: number, throttling: Config['throttling']): number {
  if (throttling === 'none')
    return Math.max(1, Math.min(4, Math.floor(cpus / 4)))
  return Math.max(1, Math.min(6, Math.floor(cpus / 6)))
}
