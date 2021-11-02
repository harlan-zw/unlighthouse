<template>
<div>
  <div class="container mx-auto">
    <div class="mx-5 mt-5">
      <h2 class="text-3xl mb-2">{{ country.flag }} {{ country.name.common }}</h2>
      <div>
        {{ country }}
      </div>
    </div>
  </div>
</div>
</template>
<script>
const getCountries = () => import('../countries.json').then(m => m.default || m)

export default {
  async asyncData({ payload, params }) {
    if (payload) {
      return payload
    }
    const countries = await getCountries()
    return {
      country: countries.find(c => c.name.common.toLowerCase().replaceAll(' ', '-') === params.country)
    }
  },
}
</script>
