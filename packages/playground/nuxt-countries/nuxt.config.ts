import defu from "defu";

const config = defu.arrayFn(require('../nuxt-shared/nuxt.config').default, {
  delayHydration: {
    mode: false
  },
  generate: {
    async routes() {
      const countriesData = () => import('./countries.json').then(m => m.default || m)
      const countries = (await countriesData())
      // @ts-ignore
      return countries.map((country, index) => {
        return {
          route: '/' + country.name.common.toLowerCase().replaceAll(' ', '-'),
          payload: {
            country,
          }
        }
      })
    }
  }
})

export default config
