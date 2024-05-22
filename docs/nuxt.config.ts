import { version } from './package.json'

export default defineNuxtConfig({
  extends: [
    'nuxt-lego',
    '@nuxt/ui-pro',
  ],
  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxt/content',
    'nuxt-lodash',
    'nuxt-icon',
    '@nuxtjs/seo',
  ],
  site: {
    url: 'https://unlighthouse.dev',
    name: 'Unlighthouse',
    description: 'Like Google Lighthouse, but it scans every single page.',
    titleSeparator: '·',
  },
  runtimeConfig: {
    public: {
      version,
    },
  },
  linkChecker: {
    enabled: false,
  },
  content: {
    highlight: {
      theme: {
        light: 'github-light',
        default: 'github-light',
        dark: 'material-theme-palenight',
      },
    },
  },
  devtools: {
    enabled: true,
  },
  ui: {
    global: true,
    icons: ['heroicons', 'simple-icons', 'ph', 'noto', 'carbon', 'logos'],
  },
  sitemap: {
    strictNuxtContentPaths: true,
    xslColumns: [
      { label: 'URL', width: '50%' },
      { label: 'Last Modified', select: 'sitemap:lastmod', width: '25%' },
      { label: 'Priority', select: 'sitemap:priority', width: '12.5%' },
      { label: 'Change Frequency', select: 'sitemap:changefreq', width: '12.5%' },
    ],
  },
  css: [
    '~/css/scrollbars.css',
  ],
  app: {
    pageTransition: {
      name: 'page',
      mode: 'out-in',
    },
    seoMeta: {
      themeColor: [
        { content: '#18181b', media: '(prefers-color-scheme: dark)' },
        { content: 'white', media: '(prefers-color-scheme: light)' },
      ],
    },
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com', crossorigin: 'anonymous' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600&display=swap' },
        { rel: 'stylesheet', href: 'https://rsms.me/inter/inter.css' },
      ],

      bodyAttrs: {
        class: 'antialiased font-sans text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900',
      },

      script: [
        {
          'src': 'https://cdn.usefathom.com/script.js',
          'data-spa': 'auto',
          'data-site': 'WPEZVIVE',
          'defer': true,
        },
      ],
    },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      failOnError: false,
      routes: ['/'],
    },
  },
})
