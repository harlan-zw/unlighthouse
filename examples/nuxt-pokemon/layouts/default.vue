<template>
<div class="min-h-screen bg-blue-500">
  <header >
    <nav class="p-5 bg-blue-700 text-yellow-500">
      <div class="flex items-center mx-auto container">
        <h1 class="text-3xl font-bold text-center mr-5">
          <nuxt-link to="/">
            Pokédex
          </nuxt-link>
        </h1>
        <nuxt-link to="/about" class="mr-5">
          About
        </nuxt-link>
        <nuxt-link to="/table">
          Table
        </nuxt-link>
      </div>
    </nav>
  </header>
  <main class="py-15">
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
