import type { LighthouseScanOptions, LighthouseScanResult } from './lighthouse'
import { createError, useRuntimeConfig } from '#imports'
import { $fetch } from 'ofetch'
import { withHttps } from 'ufo'

/**
 * Run a Lighthouse scan using Browserless.io managed browser service.
 * This eliminates the need for Chrome instance management, pooling, and cleanup.
 *
 * Requires NITRO_BROWSERLESS_TOKEN environment variable.
 * Optional NITRO_BROWSERLESS_URL for self-hosted instances.
 */
export async function runLighthouseScanViaBrowserless(
  options: LighthouseScanOptions,
): Promise<LighthouseScanResult> {
  const config = useRuntimeConfig()
  const browserlessUrl = config.browserless?.url || 'https://chrome.browserless.io'
  const browserlessToken = config.browserless?.token

  if (!browserlessToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Browserless token not configured. Set NITRO_BROWSERLESS_TOKEN environment variable.',
    })
  }

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

  // Build Lighthouse configuration
  const lighthouseConfig = {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: categories,
      formFactor,
      throttling: throttling === 'none'
        ? {
            rttMs: 0,
            throughputKbps: 0,
            requestLatencyMs: 0,
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0,
            cpuSlowdownMultiplier: 1,
          }
        : throttling === 'mobile3G'
          ? {
              rttMs: 300,
              throughputKbps: 700,
              requestLatencyMs: 1125,
              downloadThroughputKbps: 700,
              uploadThroughputKbps: 700,
              cpuSlowdownMultiplier: 4,
            }
          : undefined, // Use Lighthouse defaults for mobile4G
      screenEmulation: {
        mobile: formFactor === 'mobile',
        width: formFactor === 'mobile' ? 375 : 1350,
        height: formFactor === 'mobile' ? 667 : 940,
        deviceScaleFactor: formFactor === 'mobile' ? 2 : 1,
        disabled: false,
      },
    },
  }

  try {
    // Call Browserless /performance endpoint
    // Docs: https://www.browserless.io/docs/lighthouse
    const response = await $fetch(`${browserlessUrl}/performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      query: {
        token: browserlessToken,
      },
      body: {
        url,
        config: lighthouseConfig,
      },
      timeout: 120000, // 2 minutes
    })

    // Transform Browserless response to our format
    const lhr = response as any

    if (!lhr || !lhr.categories) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Invalid response from Browserless',
      })
    }

    const result: LighthouseScanResult = {
      url: lhr.finalUrl || lhr.requestedUrl || url,
      fetchTime: lhr.fetchTime,
      categories: {},
      audits: {},
    }

    // Extract category scores
    for (const [categoryId, category] of Object.entries(lhr.categories || {})) {
      result.categories[categoryId] = {
        id: (category as any).id,
        title: (category as any).title,
        score: (category as any).score,
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
      if (lhr.audits?.[auditId]) {
        const audit = lhr.audits[auditId]
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
  catch (e: any) {
    // Handle Browserless-specific errors
    if (e.status === 401 || e.statusCode === 401) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Invalid Browserless token',
      })
    }

    if (e.status === 429 || e.statusCode === 429) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Browserless rate limit exceeded',
      })
    }

    throw createError({
      statusCode: e.status || e.statusCode || 500,
      statusMessage: `Browserless scan failed: ${e.message || e.data?.message || 'Unknown error'}`,
    })
  }
}
