<script setup lang="ts">
const docus = useDocus()
</script>

<template>
  <NuxtLink class="navbar-logo" to="/" :aria-label="docus?.header?.title">
    <div class="flex items-center">
      <div class="flex items-center mr-5">
        <div>
          <img src="/logo-dark.svg" alt="Unlighthouse Logo" class="block dark:hidden text-black dark:text-white w-5 h-5 mr-2">
          <img src="/logo-light.svg" alt="Unlighthouse Logo" class="hidden dark:block text-black dark:text-white w-5 h-5 mr-2">
        </div>
        <div class="flex flex-col">
          <h1 class="font-bold text-xl">
            Unlighthouse
          </h1>
        </div>
      </div>
    </div>
  </NuxtLink>
</template>

<style lang="ts" scoped>
css({
  a: {
    display: 'flex',
    alignItems: 'center',
    flex: 'none',
  }
})
</style>
