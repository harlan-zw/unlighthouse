<template>
  <nuxt-link
    :to="pokemon.url"
    class="bg-white rounded p-3 flex items-center justify-center flex-col"
  >
    <p class="text-gray-500 text-sm">
      #{{ pokemon.number }}
    </p>
    <img :src="pokemon.thumbnail" :alt="pokemon.name.english" width="100" height="100" />
    <h2 class="text-gray-700 font-bold">
      {{ pokemon.name.english }}
    </h2>
  </nuxt-link>
</template>
<script>
export default {
  props: {
    pokemon: Object,
  },
}
</script>
