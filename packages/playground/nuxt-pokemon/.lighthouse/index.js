
import { starterPokedex } from '../logic'
import { defineComponent } from '@nuxtjs/composition-api'

export default defineComponent({
  head: {
    title: 'Home page test',

  },
  setup () {
    return {
      starterPokedex
    }
  }
})
