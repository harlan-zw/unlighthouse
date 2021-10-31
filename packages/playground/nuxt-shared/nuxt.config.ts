import UnpluginLighthouse from '../../../src/nuxt'

const config = {
  target: 'static',
  head: {
    htmlAttrs: {
      lang: 'en',
      dir: 'ltr',
    },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
  },
  buildModules: [
    '@nuxt/typescript-build',
    '@nuxtjs/composition-api/module',
    'nuxt-windicss',
    UnpluginLighthouse,
  ],
  components: true,
}

export default config
