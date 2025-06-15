// https://nitro.unjs.io/config
export default defineNitroConfig({
  srcDir: 'server',
  runtimeConfig: {
    google: {
      cruxApiToken: '', // .env NITRO_GOOGLE_CRUX_API_TOKEN
    },
  },
  routeRules: {
    '/api/**': { cors: true },
  },
})
