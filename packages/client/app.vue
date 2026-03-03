<script setup lang="ts">
// Page title using website from composable
const titleSuffix = computed(() => {
  const site = website.value?.replace(/https?:\/\/(www.)?/, '') || 'Unlighthouse'
  return `${site} | Unlighthouse`
})
useTitle(titleSuffix)
</script>

<template>
  <UApp>
    <div class="text-gray-700 dark:text-gray-200 overflow-y-hidden max-h-screen h-screen grid grid-rows-[min-content_1fr]">
      <NavBar />
      <main class="overflow-hidden">
        <NuxtPage />
      </main>
    </div>
  </UApp>
</template>
