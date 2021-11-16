import { Cluster } from 'puppeteer-cluster'
import { Options } from '@shared'

export const NAME = 'unlighthouse'

export const defineOptions = (options: Partial<Options>) => {
  return options
}

export const defaultOptions = defineOptions({
  resolvedClient: require.resolve('unlighthouse-client'),
  host: '',
  clientPrefix: '/__lighthouse',
  apiPrefix: '/api',
  outputPath: './.lighthouse',
  debug: true,
  dynamicRouteSampleSize: 5,

  puppeteerOptions: {
    args: [],
  },
  puppeteerClusterOptions: {
    monitor: true,
    workerCreationDelay: 500,
    retryLimit: 5,
    timeout: 5 * 60 * 1000, // wait for up to 5 minutes.
    maxConcurrency: 5,
    skipDuplicateUrls: false,
    retryDelay: 1000,
    // Important, when using Lighthouse we want browser isolation.
    concurrency: Cluster.CONCURRENCY_BROWSER,
  },
  lighthouse: {
    // desktop @todo swap out depending what we're testing
    formFactor: 'desktop',
    screenEmulation: { disabled: true },
    throttling: {
      rttMs: 0,
      throughputKbps: 0,
      cpuSlowdownMultiplier: 0,
      requestLatencyMs: 0, // 0 means unset
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
})
