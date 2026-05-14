export default defineNuxtConfig({
  ssr: false,
  extends: ['./layers/design-system'],
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
  },
  fonts: {
    families: [
      { name: 'Satoshi', provider: 'google' },
      { name: 'JetBrains Mono', provider: 'google' },
    ],
  },
  icon: {
    serverBundle: 'local',
    collections: ['heroicons', 'lucide'],
  },
  imports: {
    dirs: ['composables', 'utils'],
  },
  devtools: {
    enabled: false,
  },
  // In dev the UI runs on :3000 and the backend (`pnpm cli`) on :5678.
  // Point requests directly at the backend instead of proxying — Nuxt's
  // nitro devProxy drops the query string on some routes (`/api/history/list?site=…`
  // returns 404 through the proxy while the same request hits 200 direct).
  // Production builds get these URLs injected by the host at build time via
  // window.__unlighthouse_payload, so the override only applies in dev.
  runtimeConfig: {
    public: {
      unlighthouseApiUrl: process.env.NUXT_PUBLIC_UNLIGHTHOUSE_API_URL || 'http://localhost:5678/api',
      unlighthouseWsUrl: process.env.NUXT_PUBLIC_UNLIGHTHOUSE_WS_URL || 'ws://localhost:5678/api/ws',
    },
  },
  components: [
    {
      path: '~/components',
      extensions: ['vue'],
      pathPrefix: false,
    },
  ],
  compatibilityDate: '2025-12-12',
})
