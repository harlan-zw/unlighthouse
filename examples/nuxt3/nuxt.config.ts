import { defineNuxtConfig } from 'nuxt'
import MyModule from '@unlighthouse/nuxt'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  unlighthouse: {
    debug: true,
    cache: false,
  },
})
