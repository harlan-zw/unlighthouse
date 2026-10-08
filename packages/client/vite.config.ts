import { rm } from 'node:fs/promises'
import ui from '@nuxt/ui/vite'
import Vue from '@vitejs/plugin-vue'
import IconsResolver from 'unplugin-icons/resolver'
import { defineConfig } from 'vite'
import { version } from '../../package.json'

export default defineConfig(({ mode }) => ({
  define: {
    __UNLIGHTHOUSE_VERSION__: JSON.stringify(version),
  },
  plugins: [
    Vue(),
    ui({
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
      autoImport: {
        imports: [
          'vue',
          'vue-router',
          '@vueuse/core',
        ],
        dts: true,
        vueTemplate: true,
      },
      components: {
        dirs: ['components'],
        extensions: ['vue'],
        deep: true,
        resolvers: [
          IconsResolver({
            prefix: 'i',
            enabledCollections: ['carbon', 'mdi', 'la', 'logos', 'simple-line-icons', 'icomoon-free'],
          }),
        ],
        dts: true,
        directoryAsNamespace: false,
        collapseSamePrefixes: false,
        globalNamespaces: [],
        include: [/\.vue$/, /\.vue\?vue/],
        exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/],
      },
    }),
    // Icons({
    //   compiler: 'vue3',
    //   autoInstall: true,
    // }),
    {
      name: 'unlighthouse-static-data-remover',
      async closeBundle() {
        if (mode === 'development')
          return

        const payloadPath = await this.resolve('./dist/assets/payload.js')
        if (payloadPath)
          await rm(payloadPath.id, { recursive: true, force: true })
      },
    },
  ],

  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      '@vueuse/core',
      '@vueuse/router',
      'lightweight-charts',
      'lodash-es',
      'fuse.js',
    ],
    exclude: [
      'vue-demi',
      '@tailwindcss/oxide',
    ],
  },

  build: {
    // three.js is a single ~630 kB module that chunk splitting cannot divide.
    // It loads lazily via LighthouseThreeD and static reports never load it. Raise the
    // warning limit so only that chunk stays above the default 500 kB.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      external: [
        '@tailwindcss/oxide',
        '@tailwindcss/vite',
        /\.node$/,
        'exsolve',
        'pkg-types',
        'confbox',
        'pathe',
        /^@nuxt\/kit/,
      ],
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'ui',
              test: /node_modules[\\/](@nuxt[\\/]ui|reka-ui|tailwind-merge)/,
            },
            {
              name: 'charts',
              test: /node_modules[\\/]lightweight-charts/,
            },
            {
              name: 'search',
              test: /node_modules[\\/](fuse\.js|lodash-es)/,
            },
          ],
        },
      },
    },
  },

  server: {
    fs: {
      strict: false,
    },
  },
}))
