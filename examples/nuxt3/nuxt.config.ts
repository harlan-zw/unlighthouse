import Unlighthouse from '../../integrations/nuxt'

export default defineNuxtConfig({
  modules: [
    Unlighthouse,
  ],
  unlighthouse: {
    debug: true,
    cache: false,
  },
})
