import { defineConfig } from 'vitepress'
import type MarkdownIt from 'markdown-it'

export default defineConfig({
  title: 'Unlighthouse',
  description: 'Unlighthouse scans your entire site using Google Lighthouse, with a modern UI, minimal config and smart sampling.',
  head: [
    ['script', { src: 'https://cdn.usefathom.com/script.js', ['data-site']: 'WPEZVIVE', defer: true }],
    ['meta', { property: 'og:title', content: 'Unlighthouse' }],
    ['meta', { property: 'og:description', content: 'Unlighthouse scans your entire site using Google Lighthouse, with a modern UI, minimal config and smart sampling.' }],
    ['meta', { property: 'og:url', content: 'https://next.unlighthouse.dev/' }],
    ['meta', { property: 'og:image', content: 'https://next.unlighthouse.dev/og.png' }],
    ['meta', { name: 'twitter:title', content: 'Unlighthouse' }],
    ['meta', { name: 'twitter:description', content: 'Unlighthouse scans your entire site using Google Lighthouse, with a modern UI, minimal config and smart sampling.' }],
    ['meta', { name: 'twitter:image', content: 'https://next.unlighthouse.dev/og.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml', media: '(prefers-color-scheme:no-preference)' }],
    ['link', { rel: 'icon', href: '/logo-dark.svg', type: 'image/svg+xml', media: '(prefers-color-scheme:dark)' }],
    ['link', { rel: 'icon', href: '/logo-light.svg', type: 'image/svg+xml', media: '(prefers-color-scheme:light)' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=DM+Serif+Display:ital@0;1&display=swap' }],
  ],
  markdown: {
    config(md) {
      md.use((md: MarkdownIt) => {
        const fence = md.renderer.rules.fence!
        // @ts-expect-error misc args
        md.renderer.rules.fence = (...args) => {
          const [tokens, idx] = args
          const token = tokens[idx]
          const langInfo = token.info.split(' ')
          const langName = langInfo?.length ? langInfo[0] : ''
          const filename = langName.length && langInfo[1] ? langInfo[1] : null

          // remove filename
          token.info = langName

          const rawCode = fence(...args)

          return filename
            ? rawCode.replace(/<div class="language-(\w+)">/, `<div class="language-$1 with-filename"><div class="code-block-filename">${filename}</div>`)
            : rawCode
        }
      })
    },
  },
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
        link: 'https://twitter.com/harlan_zw',
      },
      {
        text: 'Demo',
        link: 'https://inspect.unlighthouse.dev/',
      },
      {
        text: 'Discord',
        link: 'https://unlighthouse.dev/chat',
      },
    ],

    sidebar: {
      '/config/': 'auto',
      '/api/': 'auto',
      '/glossary/': 'auto',
      '/': [
        {
          text: 'Unlighthouse',
          children: [
            {
              text: 'Introduction',
              link: '/guide/',
            },
            {
              text: 'How it works',
              link: '/guide/how-it-works',
            },
          ],
        },
        {
          text: 'Guide',
          children: [
            {
              text: 'Configuring Unlighthouse',
              link: '/guide/config',
            },
            {
              text: 'Configure Google Lighthouse',
              link: '/guide/lighthouse',
            },
            {
              text: 'Configure Puppeteer',
              link: '/guide/puppeteer',
            },
            {
              text: 'Change Scan Device',
              link: '/guide/device',
            },
            {
              text: 'Handling Large Sites',
              link: '/guide/large-sites',
            },
            {
              text: 'Improving Accuracy',
              link: '/guide/improving-accuracy',
            },
            {
              text: 'Providing Route Definitions',
              link: '/guide/route-definitions',
            },
            {
              text: 'Handling SPAs',
              link: '/guide/spa',
            },
            {
              text: 'URL Discovery',
              link: '/guide/url-discovery',
            },
            {
              text: 'Modifying Client',
              link: '/guide/client',
            },
          ],
        },
        {
          text: 'Integrations',
          children: [
            {
              text: 'CLI',
              link: '/integrations/cli',
            },
            {
              text: 'Continuous Integration',
              link: '/integrations/ci',
            },
            {
              text: 'Nuxt.js',
              link: '/integrations/nuxt',
            },
            {
              text: 'Vite',
              link: '/integrations/vite',
            },
            {
              text: 'Webpack',
              link: '/integrations/webpack',
            },
          ],
        },
      ],
    },
  },
})
