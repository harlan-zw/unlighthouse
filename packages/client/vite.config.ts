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
      transformIndexHtml: {
        apply: 'pre', // or 'post'
        transform(html) {
          if (process.env.NODE_ENV === 'development')
            return html

          return html
            .replace(/<script data-unlighthouse>.*?<\/script>/gms, '<script data-unlighthouse><!-- Unlighthouse Placeholder --></script>')
        },
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
