// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-15',

  devtools: { enabled: true },

  runtimeConfig: {
    lighthouse: {
      chromePath: '', // .env NUXT_LIGHTHOUSE_CHROME_PATH (optional)
      minChromeInstances: 1, // .env NUXT_LIGHTHOUSE_MIN_CHROME_INSTANCES
      maxChromeInstances: 5, // .env NUXT_LIGHTHOUSE_MAX_CHROME_INSTANCES
      chromeIdleTimeout: 5 * 60 * 1000, // .env NUXT_LIGHTHOUSE_CHROME_IDLE_TIMEOUT (ms)
      maxConcurrency: 3, // .env NUXT_LIGHTHOUSE_MAX_CONCURRENCY
    },
    browserless: {
      url: '', // .env NUXT_BROWSERLESS_URL (default: https://chrome.browserless.io)
      token: '', // .env NUXT_BROWSERLESS_TOKEN (required for /api/scan-browserless)
    },
  },

  nitro: {
    routeRules: {
      '/api/**': { cors: true },
    },
  },
})
