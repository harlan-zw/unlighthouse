import Unlighthouse from '@unlighthouse/nuxt'

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
  unlighthouse: {
    debug: true,
  },
  buildModules: [
    Unlighthouse,
    'nuxt-vite',
    '@nuxt/typescript-build',
    '@nuxtjs/composition-api/module',
    // 'nuxt-windicss',
  ],
  components: true,
  generate: {
    async routes() {
      const getPokedex = () => import('./pokedex.json').then(m => m.default || m)
      const pokemons = (await getPokedex()).slice(0, 100)
      // @ts-ignore
      return pokemons.map((pokemon, index) => {
        return {
          route: '/pokemon/' + pokemon.id,
          payload: {
            pokemon,
            pokemons: pokemons.slice(Math.max(index - 9, 0), Math.min(index + 11, 20))
          }
        }
      })
    }
  }
}

export default config
