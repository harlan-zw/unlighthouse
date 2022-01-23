import { defineNuxtConfig } from 'nuxt3'
import MyModule from '..'

export default defineNuxtConfig({
  modules: [
    MyModule
  ],
  unlighthouse: {
    debug: true,
    cache: false,
  }
})
