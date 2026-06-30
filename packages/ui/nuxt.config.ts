import { iconAliasMap } from './layers/design-system/shared/icons'
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  ssr: false,
  app: {
    head: {
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', type: 'image/png', href: '/icon-16x16.png', sizes: '16x16' },
        { rel: 'icon', type: 'image/png', href: '/icon-32x32.png', sizes: '32x32' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },
  // The UI is built on the canonical unlighthouse design-system layer: tokens,
  // fonts, motion, primitives, and @nuxt/ui theme all come from that layer.
  extends: ['./layers/design-system'],
  modules: ['@nuxt/ui', '@nuxtjs/color-mode', '@nuxt/icon', 'nuxt-use-query'],
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
  },
  icon: {
    aliases: iconAliasMap(),
    serverBundle: 'local',
    collections: ['heroicons', 'lucide'],
  },
  imports: {
    dirs: ['composables', 'lib'],
  },
  alias: {
    '@unlighthouse/contracts/logging': fileURLToPath(new URL('../contracts/src/logging/index.ts', import.meta.url)),
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
  // Allow extra dev-server hostnames (tailscale, ngrok, cloudflare tunnels…)
  // through Vite's allowedHosts check. Comma-separated env var so personal
  // hostnames stay out of the repo. Unset → Vite default (localhost only).
  vite: {
    optimizeDeps: {
      include: [
        '@vueuse/core',
        'reka-ui',
        'vue-sonner',
        'zod',
      ],
    },
    server: {
      allowedHosts: process.env.NUXT_DEV_ALLOWED_HOSTS
        ?.split(',')
        .map(h => h.trim())
        .filter(Boolean),
    },
  },
  compatibilityDate: '2026-05-24',
})
