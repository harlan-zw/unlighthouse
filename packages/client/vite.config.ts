import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Pages from 'vite-plugin-pages'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import WindiCSS from 'vite-plugin-windicss'
import IconsResolver from 'unplugin-icons/resolver'
import AutoImport from 'unplugin-auto-import/vite'
import { HeadlessUiResolver } from 'unplugin-vue-components/resolvers'
import * as fs from 'fs-extra'

export default defineConfig({
  mode: 'development',
  plugins: [
    Vue(),
    Pages({
      pagesDir: 'pages',
    }),
    Components({
      dirs: ['components'],
      resolvers: [
        IconsResolver(),
        HeadlessUiResolver({}),
      ],
    }),
    Icons(),
    AutoImport({
      imports: [
        // presets
        'vue',
        'vue-router',
      ],
    }),
    WindiCSS({
      scan: {
        dirs: [
          '**',
        ],
      },
    }),
    {
      // remove our static data when we build
      name: 'unlighthouse-static-data-remover',
      // remove the development payload, minimise client build
      async closeBundle() {
        if (process.env.NODE_ENV === 'development')
          return

        const payloadPath = await this.resolve('./dist/assets/payload.js')
        if (payloadPath)
          await fs.rm(payloadPath.id, {})
      },
    },
  ],

  build: {
    minify: false,
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
