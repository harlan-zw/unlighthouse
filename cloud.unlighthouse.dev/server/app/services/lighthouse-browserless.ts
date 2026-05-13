import type { LighthouseScanOptions, LighthouseScanResult } from './lighthouse'
import { createRemoteLighthouseAuditor } from '@unlighthouse/core/auditors/remote-lighthouse'
import { withHttps } from 'ufo'
import { createError, useRuntimeConfig } from '#imports'

// Browserless.io integration via the @unlighthouse/core remote-lighthouse primitive.
// The transport hits Browserless `/performance`; this module owns:
//   - Browserless-specific Lighthouse config (formFactor + throttling presets)
//   - error-code mapping (401 → invalid token, 429 → rate limit)
//   - LHR → LighthouseScanResult projection that the cloud's DB columns + cache depend on

const KEY_AUDITS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
  'server-response-time',
]

function buildLighthouseConfig(options: LighthouseScanOptions): Record<string, unknown> {
  const formFactor = options.formFactor || 'mobile'
  const throttling = options.throttling || 'mobile4G'
  const categories = options.categories?.length
    ? options.categories
    : ['performance', 'accessibility', 'best-practices', 'seo']

  // mobile4G is Lighthouse's default; passing `undefined` keeps it.
  const throttlingPreset
    = throttling === 'none'
      ? { rttMs: 0, throughputKbps: 0, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0, cpuSlowdownMultiplier: 1 }
      : throttling === 'mobile3G'
        ? { rttMs: 300, throughputKbps: 700, requestLatencyMs: 1125, downloadThroughputKbps: 700, uploadThroughputKbps: 700, cpuSlowdownMultiplier: 4 }
        : undefined

  return {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: categories,
      formFactor,
      throttling: throttlingPreset,
      screenEmulation: {
        mobile: formFactor === 'mobile',
        width: formFactor === 'mobile' ? 375 : 1350,
        height: formFactor === 'mobile' ? 667 : 940,
        deviceScaleFactor: formFactor === 'mobile' ? 2 : 1,
        disabled: false,
      },
    },
  }
}

export async function runLighthouseScanViaBrowserless(
  options: LighthouseScanOptions,
): Promise<LighthouseScanResult> {
  const config = useRuntimeConfig()
  const endpoint = `${config.browserless?.url || 'https://chrome.browserless.io'}/performance`
  const token = config.browserless?.token

  if (!token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Browserless token not configured. Set NITRO_BROWSERLESS_TOKEN environment variable.',
    })
  }

  const url = withHttps(options.url)
  if (!URL.canParse(url)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL provided' })
  }

  const auditor = createRemoteLighthouseAuditor({ endpoint, token, timeoutMs: 120_000 })

  const lhr = await auditor.audit(url, undefined, {
    lighthouseConfig: buildLighthouseConfig(options),
  }).catch((e: any) => {
    if (e?.status === 401 || e?.statusCode === 401)
      throw createError({ statusCode: 500, statusMessage: 'Invalid Browserless token' })
    if (e?.status === 429 || e?.statusCode === 429)
      throw createError({ statusCode: 503, statusMessage: 'Browserless rate limit exceeded' })
    throw createError({
      statusCode: e?.status || e?.statusCode || 500,
      statusMessage: `Browserless scan failed: ${e?.message || e?.data?.message || 'Unknown error'}`,
    })
  }) as any

  if (!lhr?.categories) {
    throw createError({ statusCode: 500, statusMessage: 'Invalid response from Browserless' })
  }

  const result: LighthouseScanResult = {
    url: lhr.finalUrl || lhr.requestedUrl || url,
    fetchTime: lhr.fetchTime,
    categories: {},
    audits: {},
  }

  for (const [categoryId, category] of Object.entries(lhr.categories)) {
    const c = category as any
    result.categories[categoryId] = { id: c.id, title: c.title, score: c.score }
  }

  for (const auditId of KEY_AUDITS) {
    const audit = lhr.audits?.[auditId]
    if (audit) {
      result.audits[auditId] = {
        id: audit.id,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        displayValue: audit.displayValue,
        numericValue: audit.numericValue,
      }
    }
  }

  return result
}
