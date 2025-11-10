import { version } from '../../package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  // SPA mode - no server-side rendering
  ssr: false,

  app: {
    baseURL: '/',
    buildAssetsDir: '/assets/',
    head: {
      htmlAttrs: {
        lang: 'en',
        class: 'dark',
      },
      link: [
        {
          rel: 'icon',
          href: '/assets/logo.svg',
          type: 'image/svg+xml',
          media: '(prefers-color-scheme:no-preference)',
        },
        {
          rel: 'icon',
          href: '/assets/logo-dark.svg',
          type: 'image/svg+xml',
          media: '(prefers-color-scheme:dark)',
        },
        {
          rel: 'icon',
          href: '/assets/logo-light.svg',
          type: 'image/svg+xml',
          media: '(prefers-color-scheme:light)',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=DM+Serif+Display:ital@0;1&display=swap',
        },
      ],
      bodyAttrs: {
        class: 'dark:bg-[#020617]',
      },
      script: [
        {
          children: 'window.__unlighthouse_static = true',
          'data-unlighthouse-inline': '',
        },
      ],
      style: [
        {
          children: `
            button[disabled] {
              opacity: 0.5;
              cursor: not-allowed;
            }
            /* scroll bars courtesy of https://antfu.me/ */
            :root {
              --c-bg: #fff;
              --c-scrollbar: #eee;
              --c-scrollbar-hover: #bbb
            }
            html.dark {
              --c-bg: #050505;
              --c-scrollbar: #111;
              --c-scrollbar-hover: #222
            }
            * {
              scrollbar-color: var(--c-scrollbar) var(--c-bg)
            }
            ::-webkit-scrollbar {
              width: 6px
            }
            ::-webkit-scrollbar:horizontal {
              height: 6px
            }
            ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner {
              background: var(--c-bg);
              border-radius: 10px
            }
            ::-webkit-scrollbar-thumb {
              background: var(--c-scrollbar);
              border-radius: 10px
            }
            ::-webkit-scrollbar-thumb:hover {
              background: var(--c-scrollbar-hover)
            }
          `,
        },
      ],
    },
  },

  modules: ['@nuxt/ui'],

  ui: {
    modal: {
      variants: {
        fullscreen: {
          true: {
            content: 'inset-0',
          },
          false: {
            content: 'max-w-2xl',
          },
        },
      },
    },
  },

  icon: {
    collections: ['carbon', 'heroicons', 'ic', 'mdi', 'la', 'logos', 'vscode-icons', 'simple-line-icons', 'icomoon-free'],
  },

  // Auto-import configuration
  imports: {
    dirs: ['logic', 'logic/actions'],
  },

  // Component auto-import
  components: [
    {
      path: '~/components',
      extensions: ['vue'],
      pathPrefix: false,
    },
  ],

  css: ['~/index.css'],

  vite: {
    define: {
      __UNLIGHTHOUSE_VERSION__: JSON.stringify(version),
    },
    optimizeDeps: {
      include: [
        'vue',
        '@vueuse/core',
        'lightweight-charts',
        'lodash-es',
        'dayjs',
        'fuse.js',
        '@headlessui/vue',
      ],
      exclude: [
        'vue-demi',
        '@tailwindcss/oxide',
      ],
    },
    server: {
      fs: {
        strict: false,
      },
    },
  },

  build: {
    transpile: ['three', 'lightweight-charts'],
  },

  // Custom hook to move build output to dist/ directory for compatibility with core package
  hooks: {
    'build:done': async () => {
      // Nuxt generates to .output/public in SPA mode
      // We'll use a postbuild script to move it to dist/
    },
  },

  experimental: {
    // Enable any needed experimental features
  },

  compatibilityDate: '2025-01-10',
})
