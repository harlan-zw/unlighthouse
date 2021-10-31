
import { starterPokedex } from '../logic'
import { defineComponent } from '@nuxtjs/composition-api'

export default defineComponent({
  head: {
    title: 'Pokedex Table Layout'
  },
  setup () {
    return {
      starterPokedex
    }
  }
})
