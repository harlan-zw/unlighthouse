import type { Flags, Result } from 'lighthouse'
import { createError } from '#imports'
import lighthouse from 'lighthouse'
import chromeLauncher from 'chrome-launcher'
import { withHttps } from 'ufo'

export interface LighthouseScanOptions {
  url: string
  categories?: string[]
  formFactor?: 'mobile' | 'desktop'
  throttling?: 'mobile3G' | 'mobile4G' | 'none'
}

export interface LighthouseScanResult {
  url: string
  fetchTime: string
  categories: {
    [key: string]: {
      id: string
      title: string
      score: number | null
    }
  }
  audits: {
    [key: string]: any
  }
}

export async function runLighthouseScan(options: LighthouseScanOptions): Promise<LighthouseScanResult> {
  const url = withHttps(options.url)

  // Validate URL
  try {
    new URL(url)
  }
  catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid URL provided',
    })
  }

  const formFactor = options.formFactor || 'mobile'
  const throttling = options.throttling || 'mobile4G'

  // Default to all categories if none specified
  const categories = options.categories?.length
    ? options.categories
    : ['performance', 'accessibility', 'best-practices', 'seo']

  // Launch Chrome
  let chrome
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    })
  }
  catch (e) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to launch Chrome',
    })
  }

  const lighthouseOptions: Flags = {
    logLevel: 'error',
    output: 'json',
    onlyCategories: categories,
    port: chrome.port,
    formFactor,
    screenEmulation: {
      mobile: formFactor === 'mobile',
      width: formFactor === 'mobile' ? 375 : 1350,
      height: formFactor === 'mobile' ? 667 : 940,
      deviceScaleFactor: formFactor === 'mobile' ? 2 : 1,
      disabled: false,
    },
    throttling: throttling === 'none'
      ? {
          rttMs: 0,
          throughputKbps: 0,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
          cpuSlowdownMultiplier: 1,
        }
      : undefined,
  }

  try {
    const runnerResult = await lighthouse(url, lighthouseOptions)

    if (!runnerResult || !runnerResult.lhr) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Lighthouse scan failed to produce results',
      })
    }

    const lhr = runnerResult.lhr as Result

    // Normalize the response
    const result: LighthouseScanResult = {
      url: lhr.finalDisplayedUrl || url,
      fetchTime: lhr.fetchTime,
      categories: {},
      audits: {},
    }

    // Extract category scores
    for (const [categoryId, category] of Object.entries(lhr.categories)) {
      result.categories[categoryId] = {
        id: category.id,
        title: category.title,
        score: category.score,
      }
    }

    // Extract key audits
    const keyAudits = [
      'first-contentful-paint',
      'largest-contentful-paint',
      'total-blocking-time',
      'cumulative-layout-shift',
      'speed-index',
      'interactive',
      'server-response-time',
    ]

    for (const auditId of keyAudits) {
      if (lhr.audits[auditId]) {
        result.audits[auditId] = {
          id: lhr.audits[auditId].id,
          title: lhr.audits[auditId].title,
          description: lhr.audits[auditId].description,
          score: lhr.audits[auditId].score,
          displayValue: lhr.audits[auditId].displayValue,
          numericValue: lhr.audits[auditId].numericValue,
        }
      }
    }

    return result
  }
  catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Lighthouse scan failed: ${e.message}`,
    })
  }
  finally {
    // Always kill Chrome
    if (chrome) {
      await chrome.kill()
    }
  }
}
