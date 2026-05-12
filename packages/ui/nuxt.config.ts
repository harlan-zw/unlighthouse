export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
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
  components: [
    {
      path: '~/components',
      extensions: ['vue'],
      pathPrefix: false,
    },
  ],
  compatibilityDate: '2025-12-12',
})
