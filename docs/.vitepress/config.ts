import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Unlighthouse',
  description: 'Universal site auditing powered by Lighthouse',
  head: [
    ['meta', { property: 'og:title', content: 'Unlighthouse' }],
    ['meta', { property: 'og:description', content: 'Universal site auditing powered by Lighthouse' }],
    ['meta', { property: 'og:url', content: 'https://unlighthouse.dev/' }],
    ['meta', { property: 'og:image', content: 'https://unlighthouse.dev/og.png' }],
    ['meta', { name: 'twitter:title', content: 'Unlighthouse' }],
    ['meta', { name: 'twitter:description', content: 'Universal site auditing powered by Lighthouse' }],
    ['meta', { name: 'twitter:image', content: 'https://unlighthouse.dev/og.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500;1,900&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=DM+Serif+Display:ital@0;1&display=swap'}]
  ],
  themeConfig: {
    repo: 'unlighthouse-dev/unlighthouse',
    docsDir: 'docs',
    docsBranch: 'main',
    logo: '/logo.svg',
    editLinks: true,
    editLinkText: 'Suggest changes to this page',

    /* TODO

    algolia: {
      apiKey: '...',
      indexName: 'unlighthouse',
      searchParameters: {
        facetFilters: ['tags:en']
      }
    },

    carbonAds: {
      carbon: '...',
      placement: 'unlighthouse'
    },
    */

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Config', link: '/config/' },
      {
        text: 'Discord',
        // TODO: 'https://chat.unlighthouse.dev'
        link: 'https://chat.unlighthouse.dev'
      },
      {
        text: 'Twitter',
        link: 'https://twitter.com/unlighthouse_dev'
      },
    ],

    sidebar: {
      '/config/': 'auto',
      '/api/': 'auto',
      '/': [
        {
          text: 'Guide',
          children: [
            {
              text: 'Why Unlighthouse',
              link: '/guide/why'
            },
            {
              text: 'Getting Started',
              link: '/guide/'
            },
            {
              text: 'Features',
              link: '/guide/features'
            },
          ]
        },
        {
          text: 'Integrations',
          children: [
            {
              text: 'Nuxt.js',
              link: '/integrations/nuxt'
            },
            {
              text: 'Vite',
              link: '/integrations/vite'
            },
            {
              text: 'Webpack',
              link: '/integrations/webpack'
            },
            {
              text: 'Rollup',
              link: '/integrations/rollup'
            },
          ]
        },
      ]
    }
  }
})
