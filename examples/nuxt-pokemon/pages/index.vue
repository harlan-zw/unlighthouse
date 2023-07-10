<script lang="ts">
import { defineComponent } from '@nuxtjs/composition-api'
import { starterPokedex } from '../logic'

export default defineComponent({
  setup() {
    return {
      starterPokedex,
    }
  },
  head: {
    title: 'Home test :)',
  },
})
</script>

<template>
  <div class="mx-auto container">
    <div class="mx-10">
      <div class="grid grid-cols-2 sm:grid-cols-10 gap-8 w-full">
        <pokemon-card
          v-for="(pokemon, key) in starterPokedex"
          :key="key"
          :pokemon="pokemon"
        />
      </div>
    </div>
  </div>
</template>
