import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Unlighthouse',
  description: 'Scan your entire website with Google Lighthouse',
  head: [
    ['meta', { property: 'og:title', content: 'Unlighthouse' }],
    ['meta', { property: 'og:description', content: 'Scan your entire website with Google Lighthouse' }],
    ['meta', { property: 'og:url', content: 'https://unlighthouse.dev/' }],
    ['meta', { property: 'og:image', content: 'https://unlighthouse.dev/og.png' }],
    ['meta', { name: 'twitter:title', content: 'Unlighthouse' }],
    ['meta', { name: 'twitter:description', content: 'Scan your entire website with Google Lighthouse' }],
    ['meta', { name: 'twitter:image', content: 'https://unlighthouse.dev/og.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=DM+Serif+Display:ital@0;1&display=swap'}]
  ],
  themeConfig: {
    repo: 'harlan-zw/unlighthouse',
    docsDir: 'docs',
    docsBranch: 'main',
    logo: '/logo-dark.svg',
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
      { text: 'Glossary', link: '/glossary/' },
      { text: 'Config', link: '/config/' },
      {
        text: 'Twitter',
        link: 'https://twitter.com/harlan_zw'
      },
      {
        text: 'Demo',
        link: 'https://inspect.unlighthouse.dev/'
      },
      {
        text: 'Discord',
        link: 'https://unlighthouse.dev/chat'
      },
    ],

    sidebar: {
      '/config/': 'auto',
      '/api/': 'auto',
      '/glossary/': 'auto',
      '/': [
        {
          text: 'Guide',
          children: [
            {
              text: 'Introduction',
              link: '/guide/'
            },
            {
              text: 'How it works',
              link: '/guide/how-it-works'
            },
            {
              text: 'Configuring Unlighthouse',
              link: '/guide/config'
            },
            {
              text: 'Configure Google Lighthouse',
              link: '/guide/lighthouse'
            },
            {
              text: 'Handling Large Sites',
              link: '/guide/large-sites'
            },
            {
              text: 'Improving Accuracy',
              link: '/guide/improving-accuracy'
            },
            {
              text: 'Providing Route Definitions',
              link: '/guide/route-definitions'
            },
            {
              text: 'Scanning',
              link: '/guide/scanning'
            },
            {
              text: 'Crawling',
              link: '/guide/crawling'
            },
            {
              text: 'Modifying Client',
              link: '/guide/client'
            },
          ]
        },
        {
          text: 'Integrations',
          children: [
            {
              text: 'CLI',
              link: '/integrations/cli'
            },
            {
              text: 'Continuous Integration',
              link: '/integrations/ci'
            },
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
