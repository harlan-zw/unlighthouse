import { defineNuxtConfig } from 'nuxt'
import MyModule from '../../integrations/nuxt'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  unlighthouse: {
    debug: true,
    cache: false,
  },
})
