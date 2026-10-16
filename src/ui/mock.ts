import { compareScans, type ScanComparison } from '../analysis/compare.ts'
import { summarize, type ScanSummary } from '../analysis/summary.ts'
import { groupIssues, issueItems, issuePages, type IssueHit } from '../analysis/issues.ts'
import type { BrokenLink, IssueDetail, IssueQuery, Paged, PageQuery } from '../contracts.ts'
import type { UnlighthouseEvent } from '../events.ts'
import { CATEGORIES, type Category, type Device, type Finding, type Issue, type Metrics, type Page, type Scan, type Scores, type Severity, type Site } from '../types.ts'
import { ApiError, reportUrl, type Client, type ConnectionState, type Input, type Operation, type Operations, type Output } from './api.ts'
import type { PageDetail, SiteListItem } from './shapes.ts'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)] as T

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

interface AuditSpec {
  id: string
  category: Category
  title: string
  severity: Severity
  prob: number
  ms: number
  bytes: number
  item: (ctx: { origin: string, template: string, path: string, slug: string }) => { key: string, label: string | null }
}

const AUDITS: Record<string, AuditSpec> = {
  'llms-txt': {
    id: 'llms-txt',
    category: 'agentic-browsing',
    title: 'llms.txt is missing',
    severity: 'fail',
    prob: 1,
    ms: 0,
    bytes: 0,
    item: ({ origin }) => ({ key: `${origin}/llms.txt`, label: '/llms.txt returned 404' }),
  },
  'ard-schema': {
    id: 'ard-schema',
    category: 'agentic-browsing',
    title: 'ai-catalog.json has invalid entries',
    severity: 'warn',
    prob: 1,
    ms: 0,
    bytes: 0,
    item: ({ origin }) => ({ key: `${origin}/.well-known/ai-catalog.json`, label: '2 resources lack a description' }),
  },
  'image-delivery-insight': {
    id: 'image-delivery-insight',
    category: 'performance',
    title: 'Improve image delivery',
    severity: 'fail',
    prob: 0.9,
    ms: 900,
    bytes: 412_000,
    item: ({ origin, template }) => ({ key: `${origin}/media/hero/${templateSlug(template)}-1600w.jpg`, label: `hero/${templateSlug(template)}-1600w.jpg` }),
  },
  'render-blocking-insight': {
    id: 'render-blocking-insight',
    category: 'performance',
    title: 'Render-blocking requests',
    severity: 'fail',
    prob: 0.95,
    ms: 450,
    bytes: 0,
    item: ({ origin }) => ({ key: `${origin}/assets/main.4f2a9c.css`, label: 'main.4f2a9c.css' }),
  },
  'unused-javascript': {
    id: 'unused-javascript',
    category: 'performance',
    title: 'Reduce unused JavaScript',
    severity: 'fail',
    prob: 0.85,
    ms: 600,
    bytes: 182_000,
    item: () => ({ key: 'https://www.googletagmanager.com/gtm.js?id=GTM-K4ND1L', label: 'gtm.js (Google Tag Manager)' }),
  },
  'legacy-javascript-insight': {
    id: 'legacy-javascript-insight',
    category: 'performance',
    title: 'Legacy JavaScript',
    severity: 'warn',
    prob: 0.7,
    ms: 120,
    bytes: 38_000,
    item: ({ origin }) => ({ key: `${origin}/assets/vendor.81bd0e.js`, label: 'vendor.81bd0e.js' }),
  },
  'lcp-discovery-insight': {
    id: 'lcp-discovery-insight',
    category: 'performance',
    title: 'LCP request discovery',
    severity: 'fail',
    prob: 0.75,
    ms: 700,
    bytes: 0,
    item: ({ origin, slug }) => ({ key: `${origin}/media/products/${slug}.webp`, label: `img.product-gallery__main (${slug}.webp)` }),
  },
  'cls-culprits-insight': {
    id: 'cls-culprits-insight',
    category: 'performance',
    title: 'Layout shift culprits',
    severity: 'fail',
    prob: 0.9,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'div.reviews-widget > iframe', label: 'Reviews widget iframe without reserved size' }),
  },
  'color-contrast': {
    id: 'color-contrast',
    category: 'accessibility',
    title: 'Background and foreground colors do not have a sufficient contrast ratio',
    severity: 'fail',
    prob: 0.95,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'footer .legal > a', label: '<a href="/terms">Terms</a>' }),
  },
  'image-alt': {
    id: 'image-alt',
    category: 'accessibility',
    title: 'Image elements do not have [alt] attributes',
    severity: 'fail',
    prob: 0.8,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'img.product-card__image', label: '<img class="product-card__image">' }),
  },
  'label': {
    id: 'label',
    category: 'accessibility',
    title: 'Form elements do not have associated labels',
    severity: 'fail',
    prob: 0.9,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'input#newsletter-email', label: '<input id="newsletter-email" type="email">' }),
  },
  'heading-order': {
    id: 'heading-order',
    category: 'accessibility',
    title: 'Heading elements are not in a sequentially-descending order',
    severity: 'warn',
    prob: 0.6,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'article h4.post-aside__title', label: '<h4 class="post-aside__title">' }),
  },
  'meta-description': {
    id: 'meta-description',
    category: 'seo',
    title: 'Document does not have a meta description',
    severity: 'fail',
    prob: 0.35,
    ms: 0,
    bytes: 0,
    item: () => ({ key: '', label: null }),
  },
  'crawlable-anchors': {
    id: 'crawlable-anchors',
    category: 'seo',
    title: 'Links are not crawlable',
    severity: 'fail',
    prob: 0.7,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'a.pagination__next[href="javascript:void(0)"]', label: '<a class="pagination__next">' }),
  },
  'errors-in-console': {
    id: 'errors-in-console',
    category: 'best-practices',
    title: 'Browser errors were logged to the console',
    severity: 'fail',
    prob: 0.55,
    ms: 0,
    bytes: 0,
    item: ({ origin }) => ({ key: `${origin}/api/recommendations`, label: 'Failed to load resource: 500 (/api/recommendations)' }),
  },
  'third-party-cookies': {
    id: 'third-party-cookies',
    category: 'best-practices',
    title: 'Uses third-party cookies',
    severity: 'warn',
    prob: 0.8,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'https://ads.example-network.com', label: 'ads.example-network.com (3 cookies)' }),
  },
  'webmcp-form-coverage': {
    id: 'webmcp-form-coverage',
    category: 'agentic-browsing',
    title: 'Forms are not exposed as WebMCP tools',
    severity: 'warn',
    prob: 0.95,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'form#site-search', label: '<form id="site-search">' }),
  },
  'agent-accessibility-tree': {
    id: 'agent-accessibility-tree',
    category: 'agentic-browsing',
    title: 'Interactive elements are missing from the accessibility tree',
    severity: 'fail',
    prob: 0.5,
    ms: 0,
    bytes: 0,
    item: () => ({ key: 'div.size-picker > div[onclick]', label: '<div class="size-picker__option">' }),
  },
}

function templateSlug(template: string): string {
  return template === '/' ? 'home' : template.replace(/^\//, '').replace(/\/\*/g, '').replace(/\//g, '-') || 'page'
}

interface TemplateSpec {
  pattern: string
  paths: string[]
  slowness: number
  a11y: number
  seo: number
  bp: number
  agent: number
  cls: number
  audits: string[]
}

interface SiteSpec {
  origin: string
  sample: number
  templates: TemplateSpec[]
}

const ADJ = ['oak', 'linen', 'wool', 'ceramic', 'walnut', 'brass', 'canvas', 'leather', 'cotton', 'marble', 'copper', 'bamboo', 'velvet', 'stone']
const NOUN = ['desk-lamp', 'throw', 'mug', 'shelf', 'tote', 'vase', 'stool', 'planter', 'rug', 'pillow', 'tray', 'clock', 'bowl', 'chair', 'mirror']
const TOPIC = ['how-we-cut-lcp-in-half', 'styling-small-spaces', 'care-guide', 'gift-ideas', 'behind-the-workshop', 'material-stories', 'sustainability-report', 'new-arrivals', 'designer-notes', 'shipping-updates']

function slugs(seed: number, count: number, a: readonly string[], b: readonly string[]): string[] {
  const rng = mulberry32(seed)
  const out = new Set<string>()
  let n = 0
  while (out.size < count) {
    const slug = [pick(rng, a), pick(rng, b)].filter(Boolean).join('-')
    if (!out.has(slug))
      out.add(slug)
    else if (++n > 1000)
      out.add(`${slug}-${n}`)
  }
  return [...out]
}

const PERF = ['image-delivery-insight', 'render-blocking-insight', 'unused-javascript', 'legacy-javascript-insight']
const COMMON = ['color-contrast', 'label', 'webmcp-form-coverage', 'third-party-cookies', 'llms-txt']

function shopSpec(): SiteSpec {
  const origin = 'https://shop.example.com'
  const products = slugs(11, 140, ADJ, NOUN)
  return {
    origin,
    sample: 12,
    templates: [
      { pattern: '/', paths: ['/'], slowness: 0.42, a11y: 0.92, seo: 1, bp: 0.96, agent: 0.67, cls: 0.03, audits: [...PERF, ...COMMON] },
      ...['/about', '/contact', '/pricing', '/cart', '/checkout', '/search'].map(path => ({ pattern: path, paths: [path], slowness: path === '/search' ? 0.55 : 0.25, a11y: 0.95, seo: path === '/cart' || path === '/checkout' ? 0.82 : 0.98, bp: 0.96, agent: path === '/search' ? 0.5 : 0.83, cls: 0.01, audits: ['render-blocking-insight', 'unused-javascript', ...COMMON] })),
      { pattern: '/products/*', paths: products.map(s => `/products/${s}`), slowness: 0.58, a11y: 0.84, seo: 0.92, bp: 0.78, agent: 0.5, cls: 0.06, audits: [...PERF, 'lcp-discovery-insight', 'image-alt', 'errors-in-console', 'agent-accessibility-tree', ...COMMON] },
      { pattern: '/products/*/reviews', paths: products.slice(0, 40).map(s => `/products/${s}/reviews`), slowness: 0.74, a11y: 0.81, seo: 0.85, bp: 0.74, agent: 0.5, cls: 0.21, audits: [...PERF, 'cls-culprits-insight', 'crawlable-anchors', 'errors-in-console', ...COMMON] },
      { pattern: '/blog/*', paths: slugs(23, 70, TOPIC, ['', '2025', '2026', 'part-2', 'q3', 'summer', 'winter']).map(s => `/blog/${s}`), slowness: 0.3, a11y: 0.9, seo: 0.88, bp: 0.96, agent: 0.67, cls: 0.02, audits: [...PERF, 'meta-description', 'heading-order', ...COMMON] },
      { pattern: '/category/*', paths: slugs(31, 24, ['living', 'kitchen', 'office', 'garden', 'bath', 'kids'], ['room', 'decor', 'storage', 'lighting', 'textiles']).map(s => `/category/${s}`), slowness: 0.5, a11y: 0.86, seo: 0.9, bp: 0.92, agent: 0.5, cls: 0.04, audits: [...PERF, 'image-alt', 'crawlable-anchors', ...COMMON] },
      { pattern: '/help/*', paths: slugs(41, 19, ['returns', 'shipping', 'payment', 'account', 'warranty'], ['policy', 'faq', 'times', 'options']).map(s => `/help/${s}`), slowness: 0.18, a11y: 0.97, seo: 0.92, bp: 1, agent: 0.83, cls: 0, audits: ['render-blocking-insight', 'meta-description', ...COMMON] },
    ],
  }
}

function docsSpec(): SiteSpec {
  const origin = 'https://docs.example.org'
  return {
    origin,
    sample: 10,
    templates: [
      { pattern: '/', paths: ['/'], slowness: 0.2, a11y: 0.98, seo: 1, bp: 1, agent: 0.83, cls: 0, audits: ['render-blocking-insight', 'webmcp-form-coverage', 'ard-schema'] },
      { pattern: '/guide/*', paths: slugs(51, 40, ['getting', 'deploying', 'configuring', 'testing', 'scaling', 'securing'], ['started', 'workers', 'routes', 'storage', 'auth', 'caching', 'logging']).map(s => `/guide/${s}`), slowness: 0.16, a11y: 0.96, seo: 0.92, bp: 1, agent: 0.83, cls: 0.01, audits: ['render-blocking-insight', 'unused-javascript', 'heading-order', 'webmcp-form-coverage'] },
      { pattern: '/api/*', paths: slugs(52, 34, ['client', 'server', 'router', 'store', 'queue', 'cache'], ['create', 'get', 'list', 'delete', 'update', 'options']).map(s => `/api/${s}`), slowness: 0.32, a11y: 0.88, seo: 0.92, bp: 1, agent: 0.67, cls: 0.02, audits: ['render-blocking-insight', 'unused-javascript', 'legacy-javascript-insight', 'color-contrast', 'webmcp-form-coverage'] },
      { pattern: '/changelog/*', paths: Array.from({ length: 36 }, (_, i) => `/changelog/v${3 + Math.floor(i / 12)}.${i % 12}`), slowness: 0.12, a11y: 0.95, seo: 0.83, bp: 1, agent: 0.83, cls: 0, audits: ['meta-description', 'webmcp-form-coverage'] },
    ],
  }
}

function blogSpec(): SiteSpec {
  return {
    origin: 'https://blog.example.net',
    sample: 5,
    templates: [
      { pattern: '/', paths: ['/'], slowness: 0.5, a11y: 0.9, seo: 0.9, bp: 0.9, agent: 0.5, cls: 0.05, audits: PERF },
    ],
  }
}

interface ScanPlan {
  id: string
  spec: SiteSpec
  siteId: number
  devices: Device[]
  createdAt: number
  drift: Record<string, number>
  label?: string
  branch?: string
  commit?: string
  outcome: 'done' | 'running' | 'failed'
  benchmark: number
  concurrency: number
}

interface MockPage {
  final: Page
  current: Page
  findings: Finding[]
}

interface MockScan {
  scan: Scan
  spec: SiteSpec
  pages: MockPage[]
  broken: BrokenLink[]
  pending: MockPage[]
  discovering: string[]
  hidden: MockPage[]
  found: number
}

function makeId(seed: string): string {
  return hash(seed).toString(36).padStart(7, '0').slice(0, 7)
}

function auditPage(plan: ScanPlan, template: TemplateSpec, path: string, device: Device, rng: () => number): { scores: Scores, metrics: Metrics, findings: Finding[], provenance: Page['provenance'], durationMs: number, warnings: string[] } {
  const mobile = device === 'mobile'
  const slowness = clamp(template.slowness + (plan.drift[template.pattern] ?? 0) + (rng() - 0.5) * 0.18)
  const speed = mobile ? 1 : 0.42
  const s = slowness * speed
  const perf = clamp(0.99 - s * 1.05 + (rng() - 0.5) * 0.06, 0.08, 1)
  const fraction = [0.33, 0.5, 0.67, 0.83, 1]
  const scores: Scores = {
    'performance': round(perf),
    'accessibility': round(clamp(template.a11y + (rng() - 0.5) * 0.04)),
    'best-practices': round(clamp(template.bp + (rng() - 0.5) * 0.04)),
    'seo': round(clamp(template.seo + (rng() - 0.5) * 0.04)),
    'agentic-browsing': fraction.reduce((best, f) => Math.abs(f - template.agent) < Math.abs(best - template.agent) ? f : best, 1),
  }
  const lcpBase = mobile ? 1300 : 600
  const metrics: Metrics = {
    fcp: Math.round((mobile ? 900 : 380) + s * 3400 * (0.85 + rng() * 0.3)),
    lcp: Math.round(lcpBase + s * 6400 * (0.85 + rng() * 0.3)),
    tbt: Math.round(s * s * (mobile ? 1600 : 900) * (0.7 + rng() * 0.6)),
    cls: round(clamp(template.cls * (0.6 + rng() * 0.8) + (rng() < 0.08 ? 0.12 : 0), 0, 1), 3),
    si: Math.round((mobile ? 1500 : 700) + s * 6000 * (0.85 + rng() * 0.3)),
    ttfb: Math.round(120 + rng() * 520 + (template.pattern.includes('products') ? 380 : 0)),
  }
  const slug = path.split('/').filter(Boolean)[1] ?? 'home'
  const findings: Finding[] = []
  for (const auditId of template.audits) {
    const spec = AUDITS[auditId]
    if (!spec || rng() > spec.prob)
      continue
    if (spec.category === 'performance' && !mobile && rng() < 0.35)
      continue
    const item = spec.item({ origin: plan.spec.origin, template: template.pattern, path, slug })
    const factor = (0.6 + rng() * 0.8) * (mobile ? 1 : 0.45)
    const savingsMs = spec.ms ? Math.round(spec.ms * factor) : null
    const savingsBytes = spec.bytes ? Math.round(spec.bytes * (0.8 + rng() * 0.4)) : null
    const parts: string[] = []
    if (savingsBytes)
      parts.push(`${Math.round(savingsBytes / 1024)} KiB`)
    if (savingsMs)
      parts.push(`${savingsMs} ms`)
    findings.push({
      auditId: spec.id,
      category: spec.category,
      title: spec.title,
      severity: spec.severity,
      score: spec.severity === 'fail' ? 0 : 0.5,
      displayValue: parts.length ? `Est savings of ${parts.join(', ')}` : spec.id === 'cls-culprits-insight' ? `${metrics.cls} shift` : null,
      itemKey: item.key,
      itemLabel: item.label,
      savingsMs,
      savingsBytes,
    })
  }
  const samples = 3
  const spread = round(0.01 + rng() * (s > 0.5 ? 0.14 : 0.06))
  const warnings: string[] = []
  if (spread > 0.1)
    warnings.push(`Performance score varied by ${Math.round(spread * 100)} points across ${samples} runs.`)
  if (metrics.ttfb && metrics.ttfb > 800 && rng() < 0.4)
    warnings.push('The server responded slowly (initial document took over 800 ms).')
  const benchmark = Math.round(plan.benchmark * (0.9 + rng() * 0.2))
  if (benchmark < 1000)
    warnings.push(`Benchmark index ${benchmark} is low; this machine may be too slow for stable performance scores.`)
  return {
    scores,
    metrics,
    findings,
    provenance: { lighthouseVersion: '13.5.0', benchmarkIndex: benchmark, throttling: 'simulate', concurrency: plan.concurrency, samples, spread, warnings },
    durationMs: Math.round((mobile ? 14_000 : 9_000) + s * 22_000 + rng() * 4000),
    warnings,
  }
}

const NULL_SCORES: Scores = { 'performance': null, 'accessibility': null, 'best-practices': null, 'seo': null, 'agentic-browsing': null }
const NULL_METRICS: Metrics = { fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: null }

function buildScan(plan: ScanPlan, now: number): MockScan {
  const rng = mulberry32(hash(plan.id))
  const pages: MockPage[] = []
  let finishedAt = plan.createdAt + 25_000
  for (const template of plan.spec.templates) {
    const sampled = new Set(template.paths.length <= plan.spec.sample ? template.paths : template.paths.filter((_, i) => i % Math.ceil(template.paths.length / plan.spec.sample) === 0).slice(0, plan.spec.sample))
    for (const path of template.paths) {
      for (const device of plan.devices) {
        const url = plan.spec.origin + path
        const base: Page = {
          scanId: plan.id,
          url,
          path,
          template: template.pattern,
          device,
          status: 'skipped',
          scores: NULL_SCORES,
          metrics: NULL_METRICS,
          finalUrl: null,
          statusCode: null,
          provenance: null,
          error: null,
          durationMs: null,
          finishedAt: null,
        }
        if (!sampled.has(path)) {
          pages.push({ final: base, current: base, findings: [] })
          continue
        }
        const result = auditPage(plan, template, path, device, rng)
        const failed = rng() < 0.025
        finishedAt += Math.round(result.durationMs / plan.concurrency)
        const final: Page = failed
          ? { ...base, status: 'failed', error: pick(rng, ['Navigation timeout of 90000 ms exceeded', 'Chrome crashed while loading the page (Target closed)', 'NO_FCP: The page did not paint any content']), durationMs: 90_000, finishedAt, statusCode: null }
          : { ...base, status: 'done', scores: result.scores, metrics: result.metrics, finalUrl: url, statusCode: 200, provenance: result.provenance, durationMs: result.durationMs, finishedAt }
        pages.push({ final, current: final, findings: failed ? [] : result.findings })
      }
    }
  }
  const broken: BrokenLink[] = plan.spec.origin.includes('shop')
    ? [
        { url: `${plan.spec.origin}/products/oak-side-table`, status: 404, from: `${plan.spec.origin}/category/living-room` },
        { url: `${plan.spec.origin}/products/oak-side-table`, status: 404, from: `${plan.spec.origin}/blog/styling-small-spaces` },
        { url: `${plan.spec.origin}/help/returns-form`, status: 404, from: `${plan.spec.origin}/help/returns-policy` },
        { url: `${plan.spec.origin}/press-kit.pdf`, status: 410, from: `${plan.spec.origin}/about` },
        { url: `${plan.spec.origin}/api/stock?id=2291`, status: 500, from: `${plan.spec.origin}/products/walnut-shelf` },
        { url: `${plan.spec.origin}/blog/winter-sale-2024`, status: 404, from: `${plan.spec.origin}/blog/gift-ideas-2025` },
        { url: `${plan.spec.origin}/careers`, status: 503, from: `${plan.spec.origin}/` },
      ]
    : plan.spec.origin.includes('docs')
      ? [{ url: `${plan.spec.origin}/guide/legacy-routes`, status: 404, from: `${plan.spec.origin}/api/router-options` }]
      : []
  const stats = { discovered: pages.length / plan.devices.length, queued: 0, done: 0, failed: 0, skipped: pages.filter(p => p.final.status === 'skipped').length }
  stats.done = pages.filter(p => p.final.status === 'done').length
  stats.failed = pages.filter(p => p.final.status === 'failed').length

  const scan: Scan = {
    id: plan.id,
    siteId: plan.siteId,
    origin: plan.spec.origin,
    status: 'done',
    label: plan.label ?? null,
    branch: plan.branch ?? null,
    commit: plan.commit ?? null,
    devices: plan.devices,
    options: { devices: plan.devices, throttling: 'simulate', samples: 3, sampling: { perTemplate: plan.spec.sample } },
    stats,
    lighthouseVersion: '13.5.0',
    error: null,
    createdAt: plan.createdAt,
    startedAt: plan.createdAt + 2000,
    finishedAt,
  }
  const mock: MockScan = { scan, spec: plan.spec, pages, broken, pending: [], discovering: [], hidden: [], found: 0 }

  if (plan.outcome === 'failed') {
    mock.pages = []
    mock.broken = []
    mock.scan = { ...scan, status: 'failed', error: 'Chrome exited during discovery: libnss3.so: cannot open shared object file', stats: { discovered: 0, queued: 0, done: 0, failed: 0, skipped: 0 }, lighthouseVersion: null, finishedAt: plan.createdAt + 4000 }
  }
  if (plan.outcome === 'running') {
    const audited = pages.filter(p => p.final.status !== 'skipped')
    const doneCount = Math.floor(audited.length * 0.42)
    audited.forEach((page, i) => {
      if (i < doneCount)
        return
      page.current = { ...page.final, status: i === doneCount ? 'running' : 'queued', scores: NULL_SCORES, metrics: NULL_METRICS, provenance: null, error: null, durationMs: null, finishedAt: null, finalUrl: null, statusCode: null }
      mock.pending.push(page)
    })
    mock.scan = { ...scan, status: 'auditing', finishedAt: null, startedAt: now - 6 * MINUTE }
    recount(mock)
  }
  return mock
}

function recount(mock: MockScan): void {
  const pages = mock.pages
  const devices = mock.scan.devices.length || 1
  mock.scan = {
    ...mock.scan,
    stats: {
      discovered: mock.hidden.length ? mock.found : Math.round(pages.length / devices),
      queued: pages.filter(p => p.current.status === 'queued' || p.current.status === 'running').length,
      done: pages.filter(p => p.current.status === 'done').length,
      failed: pages.filter(p => p.current.status === 'failed').length,
      skipped: pages.filter(p => p.current.status === 'skipped').length,
    },
  }
}

function mean(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null)
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

function averageScores(pages: Page[]): Scores {
  const out = { ...NULL_SCORES }
  for (const category of CATEGORIES) {
    const value = mean(pages.map(p => p.scores[category]))
    out[category] = value === null ? null : round(value)
  }
  return out
}

class MockWorld {
  sites: Site[] = []
  scans: MockScan[] = []
  listeners = new Map<string, Set<(event: UnlighthouseEvent) => void>>()
  now: () => number

  constructor(now: () => number) {
    this.now = now
    const t = now()
    const shop = shopSpec()
    const docs = docsSpec()
    const blog = blogSpec()
    this.sites = [
      { id: 1, origin: shop.origin, createdAt: t - 30 * DAY },
      { id: 2, origin: docs.origin, createdAt: t - 12 * DAY },
      { id: 3, origin: blog.origin, createdAt: t - 2 * DAY },
    ]
    const both: Device[] = ['mobile', 'desktop']
    const plans: ScanPlan[] = [
      { id: makeId('shop-1'), spec: shop, siteId: 1, devices: both, createdAt: t - 21 * DAY - 3 * HOUR, drift: { '/products/*': -0.04 }, branch: 'main', commit: 'a41c09e', outcome: 'done', benchmark: 1650, concurrency: 2 },
      { id: makeId('shop-2'), spec: shop, siteId: 1, devices: both, createdAt: t - 9 * DAY - 5 * HOUR, drift: { '/blog/*': 0.1, '/products/*': -0.05 }, branch: 'main', commit: '7be2d31', label: 'Before image CDN', outcome: 'done', benchmark: 1620, concurrency: 2 },
      { id: makeId('shop-3'), spec: shop, siteId: 1, devices: both, createdAt: t - 1 * DAY - 2 * HOUR, drift: { '/products/*': 0.06, '/blog/*': -0.08, '/products/*/reviews': 0.05 }, branch: 'feat/reviews-widget', commit: 'c90f4aa', label: 'Reviews widget', outcome: 'done', benchmark: 940, concurrency: 4 },
      { id: makeId('shop-4'), spec: shop, siteId: 1, devices: both, createdAt: t - 7 * MINUTE, drift: { '/products/*': 0.03 }, branch: 'main', commit: 'e13d5b8', outcome: 'running', benchmark: 1580, concurrency: 2 },
      { id: makeId('docs-1'), spec: docs, siteId: 2, devices: ['mobile'], createdAt: t - 11 * DAY, drift: {}, outcome: 'done', benchmark: 1710, concurrency: 2 },
      { id: makeId('docs-2'), spec: docs, siteId: 2, devices: ['mobile'], createdAt: t - 3 * HOUR, drift: { '/api/*': 0.08 }, outcome: 'done', benchmark: 1690, concurrency: 2 },
      { id: makeId('blog-1'), spec: blog, siteId: 3, devices: ['mobile'], createdAt: t - 2 * DAY, drift: {}, outcome: 'failed', benchmark: 1500, concurrency: 1 },
    ]
    this.scans = plans.map(plan => buildScan(plan, t)).sort((a, b) => b.scan.createdAt - a.scan.createdAt)
  }

  scan(id: string): MockScan {
    const scan = this.scans.find(s => s.scan.id === id)
    if (!scan)
      throw new ApiError('NOT_FOUND', `Scan ${id} not found`)
    return scan
  }

  emit(event: UnlighthouseEvent): void {
    const scanId = 'scanId' in event ? event.scanId : undefined
    if (!scanId)
      return
    for (const listener of this.listeners.get(scanId) ?? [])
      listener(event)
  }

  progress(mock: MockScan): void {
    const { stats } = mock.scan
    this.emit({ type: 'scan:progress', scanId: mock.scan.id, ...stats })
  }

  setStatus(mock: MockScan, status: Scan['status']): void {
    mock.scan = { ...mock.scan, status, ...(status === 'done' || status === 'cancelled' ? { finishedAt: this.now() } : {}) }
    this.emit({ type: 'scan:status', scanId: mock.scan.id, status })
  }

  tick(): void {
    for (const mock of this.scans) {
      const { status } = mock.scan
      if (status === 'queued') {
        mock.scan = { ...mock.scan, startedAt: this.now() }
        this.setStatus(mock, 'discovering')
        continue
      }
      if (status === 'discovering') {
        const batch = mock.discovering.splice(0, 24)
        mock.found += batch.length
        for (const path of batch) {
          const template = mock.spec.templates.find(t => t.paths.includes(path))
          this.emit({ type: 'page:discovered', scanId: mock.scan.id, url: mock.spec.origin + path, template: template?.pattern ?? path })
        }
        if (mock.discovering.length === 0) {
          mock.pages = mock.hidden
          mock.hidden = []
        }
        recount(mock)
        this.progress(mock)
        if (mock.discovering.length === 0) {
          this.emit({ type: 'log', scanId: mock.scan.id, level: 'info', message: `Discovered ${mock.scan.stats.discovered} pages in ${mock.spec.templates.length} templates` })
          this.setStatus(mock, 'auditing')
        }
        continue
      }
      if (status !== 'auditing')
        continue
      const running = mock.pending.find(p => p.current.status === 'running')
      if (running) {
        running.current = { ...running.final, finishedAt: this.now() }
        mock.pending.splice(mock.pending.indexOf(running), 1)
        const page = running.current
        const event: UnlighthouseEvent = { type: 'page:status', scanId: mock.scan.id, url: page.url, device: page.device, status: page.status, score: page.scores.performance }
        this.emit(page.error ? { ...event, error: page.error } : event)
      }
      const next = mock.pending.find(p => p.current.status === 'queued')
      if (next) {
        next.current = { ...next.current, status: 'running' }
        this.emit({ type: 'page:status', scanId: mock.scan.id, url: next.current.url, device: next.current.device, status: 'running' })
      }
      recount(mock)
      this.progress(mock)
      if (mock.pending.length === 0)
        this.setStatus(mock, 'done')
    }
  }

  start(origin: string, devices: Device[]): Scan {
    let normalized: string
    try {
      normalized = new URL(origin).origin
    }
    catch {
      throw new ApiError('INVALID_INPUT', `Not a valid URL: ${origin}`)
    }
    if (devices.length === 0)
      throw new ApiError('INVALID_INPUT', 'Pick at least one device')
    let site = this.sites.find(s => s.origin === normalized)
    if (!site) {
      site = { id: this.sites.length + 1, origin: normalized, createdAt: this.now() }
      this.sites.push(site)
    }
    const known = this.scans.find(s => s.spec.origin === normalized)?.spec
    const spec: SiteSpec = known ?? { ...shopSpec(), origin: normalized }
    const t = this.now()
    const mock = buildScan({ id: makeId(`${normalized}:${t}:${Math.random()}`), spec, siteId: site.id, devices, createdAt: t, drift: {}, outcome: 'done', benchmark: 1600, concurrency: 2 }, t)
    for (const page of mock.pages) {
      page.current = { ...page.final, status: 'queued', scores: NULL_SCORES, metrics: NULL_METRICS, provenance: null, error: null, durationMs: null, finishedAt: null, finalUrl: null, statusCode: null }
      if (page.final.status === 'skipped')
        page.current = page.final
      else
        mock.pending.push(page)
    }
    mock.discovering = spec.templates.flatMap(t => t.paths)
    mock.hidden = mock.pages
    mock.pages = []
    mock.broken = []
    mock.scan = { ...mock.scan, status: 'queued', startedAt: null, finishedAt: null }
    recount(mock)
    this.scans.unshift(mock)
    return mock.scan
  }

  side(mock: MockScan): { scan: Scan, pages: Page[], issues: Issue[] } {
    return { scan: mock.scan, pages: mock.pages.map(p => p.current), issues: this.issues(mock, {}) }
  }

  summary(id: string): ScanSummary {
    const mock = this.scan(id)
    const baseline = this.scans.find(s => s.scan.origin === mock.scan.origin && s.scan.status === 'done' && s.scan.createdAt < mock.scan.createdAt && s.scan.devices.join() === mock.scan.devices.join())
    const head = this.side(mock)
    const input: Parameters<typeof summarize>[0] = { ...head, brokenLinks: mock.broken }
    if (baseline)
      input.comparison = compareScans(this.side(baseline), head)
    return summarize(input)
  }

  hits(mock: MockScan, filter: { category?: Category, device?: Device, template?: string }): IssueHit[] {
    const entries: IssueHit[] = []
    for (const page of mock.pages) {
      if (page.current.status !== 'done')
        continue
      if (filter.device && page.current.device !== filter.device)
        continue
      if (filter.template && page.current.template !== filter.template)
        continue
      for (const finding of page.findings) {
        if (filter.category && finding.category !== filter.category)
          continue
        entries.push({ page: page.current, finding })
      }
    }
    return entries
  }

  issues(mock: MockScan, filter: { category?: Category, device?: Device, template?: string }): Issue[] {
    return groupIssues(this.hits(mock, filter))
  }

  listPages(query: PageQuery): Paged<Page> {
    const mock = this.scan(query.scanId)
    let list = mock.pages.map(p => p.current)
    if (query.device)
      list = list.filter(p => p.device === query.device)
    if (query.template)
      list = list.filter(p => p.template === query.template)
    if (query.status)
      list = list.filter(p => p.status === query.status)
    if (query.search) {
      const needle = query.search.toLowerCase()
      list = list.filter(p => p.url.toLowerCase().includes(needle))
    }
    const sort = query.sort ?? 'url'
    const order = query.order === 'desc' ? -1 : 1
    const value = (p: Page): string | number | null => {
      if (sort === 'url')
        return p.path
      if (sort === 'template')
        return p.template
      if ((CATEGORIES as readonly string[]).includes(sort))
        return p.scores[sort as Category]
      return p.metrics[sort as keyof Metrics]
    }
    list = [...list].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === vb)
        return a.path.localeCompare(b.path) || a.device.localeCompare(b.device)
      if (va === null)
        return 1
      if (vb === null)
        return -1
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'en', { numeric: true })) * order
    })
    return { items: list.slice(query.offset, query.offset + query.limit), total: list.length }
  }

  getPage(scanId: string, url: string, device: Device): PageDetail {
    const page = this.scan(scanId).pages.find(p => p.current.url === url && p.current.device === device)
    if (!page)
      throw new ApiError('NOT_FOUND', `No ${device} page ${url} in scan ${scanId}`)
    return { ...page.current, findings: page.current.status === 'done' ? page.findings : [] }
  }

  getIssue(scanId: string, auditId: string): IssueDetail {
    const mock = this.scan(scanId)
    const issue = this.issues(mock, {}).find(i => i.auditId === auditId)
    if (!issue)
      throw new ApiError('NOT_FOUND', `Issue ${auditId} not found`)
    const hits = this.hits(mock, {})
    return { issue, items: issueItems(hits, auditId), pages: issuePages(hits, auditId) }
  }

  compare(baseId: string, headId: string): ScanComparison {
    return compareScans(this.side(this.scan(baseId)), this.side(this.scan(headId)))
  }

  sitesList(): SiteListItem[] {
    return this.sites.map((site) => {
      const scans = this.scans.filter(s => s.scan.siteId === site.id)
      const last = scans[0] ?? null
      const lastDone = scans.find(s => s.scan.status === 'done')
      const lastScores: SiteListItem['lastScores'] = {}
      if (lastDone) {
        for (const device of lastDone.scan.devices)
          lastScores[device] = averageScores(lastDone.pages.map(p => p.current).filter(p => p.status === 'done' && p.device === device))
      }
      return { ...site, scans: scans.length, lastScan: last?.scan ?? null, lastScores }
    }).sort((a, b) => (b.lastScan?.createdAt ?? 0) - (a.lastScan?.createdAt ?? 0))
  }
}

export interface MockOptions {
  latency?: number
  tickMs?: number
  now?: () => number
}

export interface MockClient extends Client {
  tick(): void
  dispose(): void
}

export function createMockClient(options: MockOptions = {}): MockClient {
  const latency = options.latency ?? 180
  const tickMs = options.tickMs ?? 900
  const world = new MockWorld(options.now ?? Date.now)
  let timer: ReturnType<typeof setInterval> | null = null
  const connection = new Set<(state: ConnectionState) => void>()

  const handlers: { [K in Operation]: (input: Operations[K]['input']) => Operations[K]['output'] } = {
    'sites.list': () => world.sitesList(),
    'scans.list': (input) => {
      let list = world.scans.map(s => s.scan)
      if (input.origin)
        list = list.filter(s => s.origin === input.origin)
      if (input.status)
        list = list.filter(s => s.status === input.status)
      return { items: list.slice(input.offset, input.offset + input.limit), total: list.length }
    },
    'scans.start': input => world.start(input.site, input.devices),
    'scans.get': input => world.scan(input.scanId).scan,
    'scans.cancel': (input) => {
      const mock = world.scan(input.scanId)
      if (mock.scan.status === 'done' || mock.scan.status === 'failed' || mock.scan.status === 'cancelled')
        throw new ApiError('SCAN_NOT_RUNNING', 'Scan is not running')
      for (const page of mock.pending)
        page.current = { ...page.current, status: 'skipped' }
      mock.pending = []
      mock.discovering = []
      recount(mock)
      world.setStatus(mock, 'cancelled')
      return mock.scan
    },
    'scans.summary': input => world.summary(input.scanId),
    'scans.brokenLinks': input => world.scan(input.scanId).broken,
    'scans.templates': (input) => {
      const urls = new Map<string, Set<string>>()
      for (const page of world.scan(input.scanId).pages) {
        const set = urls.get(page.current.template) ?? new Set()
        set.add(page.current.url)
        urls.set(page.current.template, set)
      }
      return [...urls].map(([template, set]) => ({ template, pages: set.size })).sort((a, b) => b.pages - a.pages || (a.template < b.template ? -1 : a.template > b.template ? 1 : 0))
    },
    'pages.list': input => world.listPages(input),
    'pages.get': input => world.getPage(input.scanId, input.url, input.device),
    'issues.list': (input: IssueQuery) => {
      const filter: { category?: Category, device?: Device, template?: string } = {}
      if (input.category)
        filter.category = input.category
      if (input.device)
        filter.device = input.device
      if (input.template)
        filter.template = input.template
      const list = world.issues(world.scan(input.scanId), filter)
      return { items: list.slice(input.offset, input.offset + input.limit), total: list.length }
    },
    'issues.get': input => world.getIssue(input.scanId, input.auditId),
    'compare': input => world.compare(input.base, input.head),
  }

  const ensureTimer = () => {
    const active = world.scans.some(s => s.scan.status === 'queued' || s.scan.status === 'discovering' || s.scan.status === 'auditing')
    if (!timer && active && tickMs > 0)
      timer = setInterval(() => world.tick(), tickMs)
  }

  return {
    mode: 'mock',
    reportUrl,
    async call<K extends Operation>(operation: K, input: Input<K>): Promise<Output<K>> {
      if (latency > 0)
        await new Promise(resolve => setTimeout(resolve, latency * (0.6 + Math.random() * 0.8)))
      const handler = handlers[operation] as (input: Input<K>) => Output<K>
      const result = structuredClone(handler(input))
      if (operation === 'scans.start')
        ensureTimer()
      return result
    },
    subscribe(scanId, listener) {
      const set = world.listeners.get(scanId) ?? new Set()
      set.add(listener)
      world.listeners.set(scanId, set)
      ensureTimer()
      return () => {
        set.delete(listener)
      }
    },
    onConnection(listener) {
      connection.add(listener)
      listener('open')
      return () => connection.delete(listener)
    },
    tick: () => world.tick(),
    dispose() {
      if (timer)
        clearInterval(timer)
      timer = null
    },
  }
}
