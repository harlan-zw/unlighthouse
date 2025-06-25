import ui from '@nuxt/ui/vite'
import Vue from '@vitejs/plugin-vue'
import * as fs from 'fs-extra'
import IconsResolver from 'unplugin-icons/resolver'
import { HeadlessUiResolver } from 'unplugin-vue-components/resolvers'
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
            enabledCollections: ['carbon', 'ic', 'mdi', 'la', 'logos', 'vscode-icons', 'simple-line-icons', 'icomoon-free'],
          }),
          HeadlessUiResolver(),
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
          await fs.remove(payloadPath.id)
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
      'dayjs',
      'fuse.js',
      '@headlessui/vue',
    ],
    exclude: [
      'vue-demi',
      '@tailwindcss/oxide',
    ],
  },

  build: {
    rollupOptions: {
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
    },
  },

  server: {
    fs: {
      strict: false,
    },
  },
}))
