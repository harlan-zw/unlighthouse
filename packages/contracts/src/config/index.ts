// UnlighthouseConfig schema — validation only.
// See v1.md §"Cross-cutting concerns" → Config: validation, and D-011:
//   "defu owns merging. Zod schemas have NO `.default()`. The schema validates
//    the post-merge config; defaults live in a literal `defaultConfig` const."

import { z } from 'zod'
import { Assertion, Category, Device, Url } from '../types/atoms'

// Lighthouse audit categories budget — number 1..100 OR per-category map.
const Budget = z.union([
  z.number().int().min(1).max(100),
  z.partialRecord(Category, z.number().int().min(1).max(100)),
])

const ReporterConfig = z.object({
  lhciHost: z.string().optional(),
  lhciBuildToken: z.string().optional(),
  lhciAuth: z.string().optional(),
})

const Cookie = z
  .object({
    name: z.string(),
    value: z.string(),
  })
  .catchall(z.string())

const AuthOptions = z.union([
  z.literal(false),
  z.object({ username: z.string(), password: z.string() }),
])

const CiBuild = z.object({
  branch: z.string().optional(),
  commit: z.string().optional(),
  commitMessage: z.string().optional(),
})

// Comparison thresholds: keys are MetricName values + category score names.
const ComparisonThresholdKey = z.enum([
  'lcp',
  'cls',
  'tbt',
  'fcp',
  'si',
  'ttfb',
  'inp',
  'performance',
  'accessibility',
  'bestPractices',
  'seo',
])

const ComparisonConfig = z.object({
  enabled: z.boolean().optional(),
  thresholds: z.partialRecord(ComparisonThresholdKey, z.number()).optional(),
})

const CiConfig = z.object({
  budget: Budget.optional(),
  buildStatic: z.boolean().optional(),
  reporter: z
    .union([
      z.enum(['jsonSimple', 'jsonExpanded', 'lighthouseServer']),
      z.literal(false),
    ])
    .optional(),
  reporterConfig: ReporterConfig.optional(),
  assertions: z.array(Assertion).optional(),
  build: CiBuild.optional(),
  comparison: ComparisonConfig.optional(),
})

const DiscoveryOptions = z.union([
  z.literal(false),
  z.object({
    pagesDir: z.string(),
    supportedExtensions: z.array(z.string()),
  }),
])

const ScannerConfig = z.object({
  customSampling: z.record(z.string(), z.unknown()).optional(),
  ignoreI18nPages: z.boolean().optional(),
  maxRoutes: z.union([z.number().int().positive(), z.literal(false)]).optional(),
  include: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
  exclude: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
  skipJavascript: z.boolean().optional(),
  samples: z.number().int().min(1).max(10).optional(),
  throttle: z.boolean().optional(),
  crawler: z.boolean().optional(),
  dynamicSampling: z.union([z.number().int().positive(), z.literal(false)]).optional(),
  sitemap: z.union([z.boolean(), z.array(z.string())]).optional(),
  robotsTxt: z.boolean().optional(),
  device: z.union([Device, z.literal(false)]).optional(),
})

const ClientConfig = z.object({
  groupRoutesKey: z.string().optional(),
  // columns config opaque to validation — it carries Vue component thunks
  columns: z.unknown().optional(),
})

const ChromeConfig = z.object({
  useSystem: z.boolean().optional(),
  useDownloadFallback: z.boolean().optional(),
  downloadFallbackVersion: z.union([z.string(), z.number()]).optional(),
  downloadFallbackCacheDir: z.string().optional(),
})

const ServerConfig = z
  .object({
    open: z.boolean().optional(),
  })
  .catchall(z.unknown())

// Auditor provider — one entry per supported backend (D-021).
const AuditorProvider = z.discriminatedUnion('name', [
  z.object({ name: z.literal('local'), lighthouseOptions: z.unknown().optional() }),
  z.object({ name: z.literal('psi'), apiKey: z.string() }),
  z.object({ name: z.literal('crux'), apiKey: z.string().optional() }),
  z.object({ name: z.literal('dataforseo'), login: z.string(), password: z.string() }),
  z.object({ name: z.literal('mock') }),
  z.object({
    name: z.literal('cdp-connect'),
    browserWSEndpoint: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
])

const AuditorRouterStrategy = z.enum(['round-robin', 'weighted', 'fallback', 'rate-limited'])

// Single provider, or a router across many.
const AuditorConfig = z.union([
  AuditorProvider,
  z.object({
    strategy: AuditorRouterStrategy,
    providers: z.array(AuditorProvider).min(1),
  }),
])

/**
 * UnlighthouseConfig — the resolved, host-supplied configuration consumed by
 * `createUnlighthouseCore({ config })`. All fields optional; defu merges the
 * user file → env → CLI flags → call args (D-011), then the schema validates.
 *
 * Throws `UnlighthouseError({ code: 'CONFIG_INVALID' })` on validation failure.
 */
const UnlighthouseConfigSchema = z.object({
  site: z.union([Url, z.string()]).optional(),
  googleApiKey: z.string().optional(),
  root: z.string().optional(),
  cache: z.boolean().optional(),
  auth: AuthOptions.optional(),
  cookies: z.union([z.literal(false), z.array(Cookie)]).optional(),
  localStorage: z.record(z.string(), z.unknown()).optional(),
  sessionStorage: z.record(z.string(), z.unknown()).optional(),
  extraHeaders: z.union([z.literal(false), z.record(z.string(), z.string())]).optional(),
  userAgent: z.string().optional(),
  defaultQueryParams: z
    .union([z.literal(false), z.record(z.string(), z.unknown())])
    .optional(),
  configFile: z.string().optional(),
  outputPath: z.string().optional(),
  debug: z.boolean().optional(),
  routerPrefix: z.string().optional(),
  apiPrefix: z.string().optional(),
  server: ServerConfig.optional(),
  // `urls` may be an array OR a zero-arg function — function bodies are
  // opaque to validation, so we accept any callable here.
  urls: z.union([z.array(z.string()), z.custom<() => unknown>(v => typeof v === 'function')]).optional(),
  ci: CiConfig.optional(),
  client: ClientConfig.optional(),
  discovery: DiscoveryOptions.optional(),
  scanner: ScannerConfig.optional(),
  // Lighthouse + puppeteer options pass-through; opaque to validation.
  lighthouseOptions: z.record(z.string(), z.unknown()).optional(),
  puppeteerOptions: z.record(z.string(), z.unknown()).optional(),
  chrome: ChromeConfig.optional(),
  auditor: AuditorConfig.optional(),
})

export type UnlighthouseConfig = z.infer<typeof UnlighthouseConfigSchema>
export { UnlighthouseConfigSchema as UnlighthouseConfig }

/**
 * Host-agnostic defaults — D-011: defu merges, schema validates.
 * Ported from `packages/unlighthouse/src/constants.ts → defaultConfig`,
 * trimmed to fields representable without runtime host info.
 */
export const defaultConfig: UnlighthouseConfig = {
  site: '',
  outputPath: '.unlighthouse',
  routerPrefix: '/',
  apiPrefix: '/api',
  cache: true,
  debug: false,
  scanner: {
    samples: 1,
    throttle: true,
    device: 'mobile',
    maxRoutes: 200,
  },
  lighthouseOptions: {},
  discovery: {
    pagesDir: 'pages',
    supportedExtensions: ['vue', 'md'],
  },
  client: {},
  auditor: { name: 'local' },
}

// Re-exports for direct use by command schemas / preset config layers.
export {
  AuditorConfig,
  AuditorProvider,
  AuditorRouterStrategy,
  AuthOptions,
  Budget,
  ChromeConfig,
  CiBuild,
  CiConfig,
  ComparisonConfig,
  ComparisonThresholdKey,
  DiscoveryOptions,
  ScannerConfig,
}
