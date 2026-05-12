import type { UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import { ofetch } from 'ofetch'
import { resolveLighthouseConfig } from '../../../unlighthouse/src/core/config'
import { extractInsights } from '../../../unlighthouse/src/core/extract'

export interface BrowserlessOptions {
  url?: string
  token?: string
}

export function createBrowserlessProvider(providerOptions: BrowserlessOptions): UnlighthouseProvider {
  return async (url: string, options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    const browserlessUrl = providerOptions.url || 'https://chrome.browserless.io'
    const browserlessToken = providerOptions.token

    if (!browserlessToken) {
      throw new Error('Browserless token not provided.')
    }

    const config = options.lighthouseConfig || resolveLighthouseConfig(options)

    try {
      const response = await ofetch(`${browserlessUrl}/performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        query: {
          token: browserlessToken,
        },
        body: {
          url,
          config,
        },
        timeout: 120000,
      })

      const lhr = response as any

      if (!lhr || !lhr.categories) {
        throw new Error('Invalid response from Browserless')
      }

      return {
        url: lhr.finalUrl || lhr.requestedUrl || url,
        fetchTime: lhr.fetchTime,
        insights: extractInsights(lhr),
        raw: lhr,
        artifacts: lhr.artifacts,
      }
    }
    catch (e: any) {
      if (e.status === 401 || e.statusCode === 401) {
        throw new Error('Invalid Browserless token')
      }
      if (e.status === 429 || e.statusCode === 429) {
        throw new Error('Browserless rate limit exceeded')
      }
      throw new Error(`Browserless scan failed: ${e.message || 'Unknown error'}`)
    }
  }
}
