import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import WindiCSS from 'vite-plugin-windicss'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Unlighthouse from '@unlighthouse/vite'

export default defineConfig(async () => {
  return {
    plugins: [
      Components({
        include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
        dts: true,
        resolvers: [
          IconsResolver(),
        ],
      }),
      Icons(),
      WindiCSS({
        scan: {
          dirs: [
            __dirname,
          ],
        },
      }),
      // Unlighthouse({
      //   debug: true,
      //   discovery: {
      //     supportedExtensions: ['md'],
      //     pagesDir: '',
      //   },
      // }),
    ],

    optimizeDeps: {
      include: [
        'vue',
        '@vueuse/core',
      ],
      exclude: [
        'vue-demi',
      ],
    },
  }
})
