// https://nitro.unjs.io/config
export default defineNitroConfig({
  srcDir: 'server',
  runtimeConfig: {
    lighthouse: {
      chromePath: '', // .env NITRO_LIGHTHOUSE_CHROME_PATH (optional)
    },
  },
  routeRules: {
    '/api/**': { cors: true },
  },
  compatibilityDate: '2025-06-15',
})
