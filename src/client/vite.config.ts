import { resolve } from 'path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Pages from 'vite-plugin-pages'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import WindiCSS from 'vite-plugin-windicss'
import IconsResolver from 'unplugin-icons/resolver'
import AutoImport from 'unplugin-auto-import/vite'
import { HeadlessUiResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  base: '/__routes/',
  mode: 'development',

  plugins: [
    Vue(),
    Pages({
      pagesDir: 'pages',
    }),
    Components({
      dirs: ['components'],
      // @ts-ignore
      resolvers: [
        IconsResolver(),
        HeadlessUiResolver()
      ],
    }),
    Icons(),
    AutoImport({
      imports: [
        // presets
        'vue',
        'vue-router',
      ]
    }),
    WindiCSS({
      scan: {
        dirs: [
          __dirname,
        ],
      },
    }),
  ],

  server: {
    fs: {
      strict: true,
    },
  },

  build: {
    outDir: resolve(__dirname, '../../dist/client'),
    minify: true,
    emptyOutDir: true,
  },

  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      '@vueuse/core',
    ],
    exclude: [
      'vue-demi',
    ],
  },
})
