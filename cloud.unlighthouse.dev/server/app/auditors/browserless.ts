import type { LighthouseScanOptions, LighthouseScanResult } from '../services/lighthouse'
import type { Auditor } from './types'
import { createRemoteLighthouseAuditor } from '@unlighthouse/core/auditors/remote-lighthouse'
import { withHttps } from 'ufo'
import { createError, useRuntimeConfig } from '#imports'
import { KEY_AUDITS, resolveCategories, resolveScreenEmulation, resolveThrottling } from './types'

// Browserless.io adapter. Uses the @unlighthouse/core remote-lighthouse primitive whose transport
// hits Browserless `/performance`. Owns Browserless-specific error mapping (401 → invalid token,
// 429 → rate limit) and the LHR → LighthouseScanResult projection used by DB columns + cache.

function buildLighthouseConfig(options: LighthouseScanOptions): Record<string, unknown> {
  const formFactor = options.formFactor || 'mobile'
  return {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: resolveCategories(options),
      formFactor,
      throttling: resolveThrottling(options.throttling || 'mobile4G'),
      screenEmulation: resolveScreenEmulation(formFactor),
    },
  }
}

export function createBrowserlessAuditor(): Auditor {
  return {
    async audit(options) {
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
        const a = lhr.audits?.[auditId]
        if (a) {
          result.audits[auditId] = {
            id: a.id,
            title: a.title,
            description: a.description,
            score: a.score,
            displayValue: a.displayValue,
            numericValue: a.numericValue,
          }
        }
      }

      return result
    },
  }
}
