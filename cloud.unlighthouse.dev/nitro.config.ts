// https://nitro.unjs.io/config
export default defineNitroConfig({
  srcDir: 'server',
  runtimeConfig: {
    lighthouse: {
      chromePath: '', // .env NITRO_LIGHTHOUSE_CHROME_PATH (optional)
      minChromeInstances: 1, // .env NITRO_LIGHTHOUSE_MIN_CHROME_INSTANCES
      maxChromeInstances: 5, // .env NITRO_LIGHTHOUSE_MAX_CHROME_INSTANCES
      chromeIdleTimeout: 5 * 60 * 1000, // .env NITRO_LIGHTHOUSE_CHROME_IDLE_TIMEOUT (ms)
      maxConcurrency: 3, // .env NITRO_LIGHTHOUSE_MAX_CONCURRENCY
    },
    browserless: {
      url: '', // .env NITRO_BROWSERLESS_URL (default: https://chrome.browserless.io)
      token: '', // .env NITRO_BROWSERLESS_TOKEN (required for /api/scan-browserless)
    },
  },
  routeRules: {
    '/api/**': { cors: true },
  },
  compatibilityDate: '2025-06-15',
})
