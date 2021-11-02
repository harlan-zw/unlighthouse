<template>
<div>
  <header >
    <h1 class="text-3xl font-bold p-5 text-center border-green-500  border-b-3 text-gray-800">
      <nuxt-link to="/">
        World Countries
        <small class="ml-2 text-sm">{{ $isServer ? 'Not Hydrated' : 'Hydrated'}}</small>
      </nuxt-link>
    </h1>
  </header>
  <main class="bg-gray-50 py-15">
    <div class=" mx-auto container">
      <Nuxt />
    </div>
  </main>
</div>
</template>
<script>
export default {
  data () {
    return {
      invert: false,
    }
  }
}
</script>
