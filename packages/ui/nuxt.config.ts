export default defineNuxtConfig({
  ssr: false,
  // Migration to @nuxt/ui (#nuxt-ui-migration): extend the design-system layer
  // (its app.config + global.css carry the canonical theme). @nuxt/ui drives
  // Tailwind v4 now, so @nuxtjs/tailwindcss is dropped. shadcn-nuxt stays for
  // the not-yet-migrated screens — shadcn (`<Button>`), @nuxt/ui (`<UButton>`)
  // and the layer (`<UiButton>`) live in separate name prefixes, no collision.
  extends: ['./layers/design-system'],
  modules: ['@pinia/nuxt', '@nuxt/ui', 'reka-ui/nuxt', 'motion-v/nuxt', 'shadcn-nuxt', '@nuxt/icon'],
  css: ['~/assets/css/tailwind.css'],
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
  },
  icon: {
    serverBundle: 'local',
    collections: ['heroicons', 'lucide'],
  },
  imports: {
    dirs: ['composables', 'lib'],
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
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui'
  },
  // Allow extra dev-server hostnames (tailscale, ngrok, cloudflare tunnels…)
  // through Vite's allowedHosts check. Comma-separated env var so personal
  // hostnames stay out of the repo. Unset → Vite default (localhost only).
  vite: {
    optimizeDeps: {
      include: [
        '@lucide/vue',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'reka-ui',
        'tailwind-merge',
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