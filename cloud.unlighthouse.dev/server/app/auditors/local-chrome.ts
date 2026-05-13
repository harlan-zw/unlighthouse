import type { Flags, Result } from 'lighthouse'
import type { ChromeInstance } from '../services/chrome-pool'
import type { LighthouseScanResult } from '../services/lighthouse'
import type { Auditor } from './types'
import lighthouse from 'lighthouse'
import { withHttps } from 'ufo'
import { createError } from '#imports'
import { getChromePool } from '../services/chrome-pool'
import { KEY_AUDITS, resolveCategories, resolveScreenEmulation, resolveThrottling } from './types'

export function createLocalChromeAuditor(): Auditor {
  return {
    async audit(options) {
      const url = withHttps(options.url)
      if (!URL.canParse(url)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid URL provided' })
      }

      const formFactor = options.formFactor || 'mobile'
      const throttling = options.throttling || 'mobile4G'
      const categories = resolveCategories(options)

      const chromePool = getChromePool()
      let chromeInstance: ChromeInstance | null = null
      try {
        chromeInstance = await chromePool.acquire()
      }
      catch {
        throw createError({ statusCode: 503, statusMessage: 'Failed to acquire Chrome instance from pool' })
      }

      const lighthouseOptions: Flags = {
        logLevel: 'error',
        output: 'json',
        onlyCategories: categories,
        port: chromeInstance.chrome.port,
        formFactor,
        screenEmulation: resolveScreenEmulation(formFactor),
        throttling: resolveThrottling(throttling),
      }

      try {
        const runnerResult = await lighthouse(url, lighthouseOptions)
        if (!runnerResult?.lhr) {
          throw createError({ statusCode: 500, statusMessage: 'Lighthouse scan failed to produce results' })
        }
        return projectLhr(runnerResult.lhr as Result, url)
      }
      catch (e: any) {
        if (e?.statusCode)
          throw e
        throw createError({ statusCode: 500, statusMessage: `Lighthouse scan failed: ${e.message}` })
      }
      finally {
        if (chromeInstance) {
          chromePool.release(chromeInstance)
        }
      }
    },
  }
}

function projectLhr(lhr: Result, fallbackUrl: string): LighthouseScanResult {
  const result: LighthouseScanResult = {
    url: lhr.finalDisplayedUrl || fallbackUrl,
    fetchTime: lhr.fetchTime,
    categories: {},
    audits: {},
  }
  for (const [categoryId, category] of Object.entries(lhr.categories)) {
    result.categories[categoryId] = { id: category.id, title: category.title, score: category.score }
  }
  for (const auditId of KEY_AUDITS) {
    const a = lhr.audits[auditId]
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
}
