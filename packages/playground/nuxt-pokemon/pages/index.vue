<script lang="ts">
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
