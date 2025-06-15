import tailwindcss from '@tailwindcss/vite'
import Vue from '@vitejs/plugin-vue'
import * as fs from 'fs-extra'
import AutoImport from 'unplugin-auto-import/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import { HeadlessUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    Vue({
      features: {
        optionsApi: false, // Disable Options API for smaller bundle
        prodDevtools: false,
      },
    }),
    Components({
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
    }),
    Icons({
      compiler: 'vue3',
      autoInstall: true,
    }),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
      ],
      dts: true,
      vueTemplate: true,
    }),
    tailwindcss(),
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

  build: {
    minify: mode === 'production',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: '[name]-[hash].mjs',
        chunkFileNames: '[name]-[hash].mjs',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          'vue': ['vue'],
          'vue-router': ['vue-router'],
          'vue-use': ['@vueuse/core', '@vueuse/router'],
          'charts': ['lightweight-charts'],
          'utils': ['lodash-es', 'dayjs', 'fuse.js'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  resolve: {
    conditions: ['module', 'browser', 'development', 'import'],
  },

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
    ],
  },

  server: {
    fs: {
      strict: false,
    },
  },
}))
