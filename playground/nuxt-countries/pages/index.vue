<template>
<div>
  <div class="container mx-auto">
    <div class="mx-5 mt-5">
      <input type="search" placeholder="Find country" v-model="query" @input="filter" class="mb-5 w-full py-3 text-3xl px-5 border-gray-200 border-2 rounded">
      <div class="grid grid-cols-2 sm:grid-cols-8 gap-8 w-full">
        <nuxt-link v-for="(country, key) in filtered" :key="key" :to="'/' + country.name.common.toLowerCase().replaceAll(' ', '-')" class="p-3 bg-white rounded text-center">
          <h2 class="text-lg mb-2">{{ country.flag }} {{ country.name.common }}</h2>
          <h3 class="text-sm text-gray-800">Capital: {{ country.capital[0] }}</h3>
          <p class="text-sm text-gray-800">Phone: {{ country.callingCodes[0] }}</p>
        </nuxt-link>
      </div>
    </div>
  </div>
</div>
</template>
<script>
const getCountries = () => import('../countries.json').then(m => m.default || m)

export default {
  async asyncData({ payload }) {
    if (payload) {
      return payload
    }
    const countries = await getCountries()
    return {
      countries,
      filtered: countries
    }
  },
  data () {
    return {
      query: '',
      filtered: [],
    }
  },
  methods: {
    filter () {
      if (!this.query.length) {
        this.filtered = this.countries
      } else {
        this.filtered = this.countries.filter(s => s.name.common.toLowerCase().indexOf(this.query.toLowerCase()) >= 0)
      }
    }
  },
}
</script>
