export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
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
