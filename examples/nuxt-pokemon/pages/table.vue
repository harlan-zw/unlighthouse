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
    title: 'Pokedex Table Layout',
  },
})
</script>

<template>
  <div class="mx-auto container">
    <div class="mx-10">
      <table class="table-auto w-full bg-blue-50 rounded-xl">
        <thead>
          <tr class="text-gray-700 children:p-3">
            <th />
            <th>ID</th>
            <th>Name</th>
            <th>Stats</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(pokemon, key) in starterPokedex" :key="key" class="children:p-3">
            <td> <img :src="pokemon.thumbnail" width="100" height="100"></td>
            <td>#{{ pokemon.id }}</td>
            <td>
              <nuxt-link

                :to="pokemon.url"
                class="bg-white rounded p-3 flex items-center justify-center flex-col"
              >
                {{ pokemon.name.english }}
              </nuxt-link>
            </td>
            <td>Hp: {{ pokemon.base.HP }}, Attack: {{ pokemon.base.Attack }}</td>
            <td>{{ pokemon.type.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
