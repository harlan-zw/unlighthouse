import type { UnlighthouseOptions, UnlighthouseReport, UnlighthouseProvider } from '../types'
import { launch } from 'chrome-launcher'
import lighthouse, { generateReport as _generateReport } from 'lighthouse'
import { extractInsights } from '../core/extract'
import { resolveLighthouseConfig } from '../core/config'

export const generateReport = _generateReport

export const createLocalProvider = (): UnlighthouseProvider => {
  return async (url: string, options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    let chrome
    let port = options.port || options.lighthouseFlags?.port as number
  
    if (!port) {
      chrome = await launch({
          chromeFlags: ['--headless', ...(options.launchOptions?.chromeFlags || [])],
          ...options.launchOptions,
      })
      port = chrome.port
    }
  
    const config = options.lighthouseConfig || resolveLighthouseConfig(options)
  
    try {
      const result = await lighthouse(url, {
        port,
        output: 'json',
        logLevel: options.logLevel || 'info',
        ...options.lighthouseFlags,
      }, config)
  
      if (!result || !result.lhr) {
        throw new Error('Lighthouse failed to run')
      }
  
      return {
        url: result.lhr.requestedUrl,
        fetchTime: result.lhr.fetchTime,
        insights: extractInsights(result.lhr),
        raw: result.lhr,
        artifacts: result.artifacts,
      }
    } finally {
      if (chrome) {
        await chrome.kill()
      }
    }
  }
}
