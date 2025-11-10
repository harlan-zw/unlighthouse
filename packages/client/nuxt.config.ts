import { version } from '../../package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // SPA mode - no server-side rendering
  ssr: false,

  pages: true,

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
    },
  },

  modules: ['@nuxt/ui'],

  // Disable fonts module to avoid network and build issues
  fonts: {
    enabled: false,
  },

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
    build: {
      sourcemap: false,
      minify: 'esbuild',
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    esbuild: {
      target: 'esnext',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
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
