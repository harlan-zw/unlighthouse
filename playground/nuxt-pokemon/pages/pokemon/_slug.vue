<script lang="ts">
import { useRoute, useRouter, useMeta, useContext } from '@nuxtjs/composition-api'
import { getPokemonForSlug, starterPokedex } from '../../logic'
import { defineComponent } from '@nuxtjs/composition-api'
import { $URL } from 'ufo'

export default defineComponent({
  head: {
  },
  setup () {
    const route = useRoute()
    const router = useRouter()
    const context = useContext()

    const pokemon = getPokemonForSlug(route.value.params.slug)


    useMeta({
      title: pokemon.name.english,
      meta: [
        { hid: 'description', name: 'description', content: `Pokemon #${pokemon.id}: ${pokemon.name.english}. Types are ${pokemon.type.join(', ')}.` },
        { hid: 'image', property: 'image', content: `http://localhost:3000${pokemon.thumbnail}` }
      ]
    })

    return {
      starterPokedex,
      pokemon
    }
  }
})
</script>
<template>
<div class="mx-auto container">
  <div class="mx-10">
    <div class="bg-green-50 rounded p-5 w-500px max-w-full mx-auto text-center mb-10">
      <h1 class="text-5xl text-white mb-3 text-green-900">{{ pokemon.name.english }}</h1>
      <img :src="pokemon.thumbnail" width="100" height="100" class="mb-2 mx-auto" >
      <div class="mb-3">
    <span v-for="(type, key) in pokemon.type" :key="key" class="bg-pink-500 rounded-full px-2 py-1 text-white mx-1">
      {{ type }}
    </span>
      </div>
      <div v-for="(type, key) in pokemon.base" :key="key">
        {{ key }}: {{ type }}
      </div>
    </div>

    <h2 class="mb-3 text-blue-900 text-xl">Other Pokemon</h2>
    <div class="grid grid-cols-2 sm:grid-cols-10 gap-8 w-full">
      <template v-for="(childPokemon, key) in starterPokedex">
      <pokemon-card
          v-if="key < 21 && pokemon.id !== childPokemon.id"
          :key="key"
          :pokemon="childPokemon"
      />
      </template>
    </div>
  </div>
</div>
</template>

