import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import WindiCSS from 'vite-plugin-windicss'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'

export default defineConfig(async ({ command, mode }) => {

  const plugins = []
  if (command === 'serve') {
    const Unlighthouse = (await import('@unlighthouse/vite')).default
    plugins.push(Unlighthouse({
      debug: true,
      discovery: {
        supportedExtensions: ['md'],
        pagesDir: '',
      },
    }))
  }

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
      ...plugins,
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
