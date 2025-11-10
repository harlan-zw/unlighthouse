<script setup lang="ts">
// Initialize window globals before app loads
if (import.meta.client) {
  if (typeof window.__unlighthouse_static === 'undefined') {
    window.__unlighthouse_static = true
  }
  if (typeof window.__unlighthouse_payload === 'undefined') {
    window.__unlighthouse_payload = {
      options: {},
      reports: [],
      scanMeta: { scannedRoutes: 0, finishedRoutes: 0 },
    }
  }
}

// Set page title
const titleSuffix = computed(() => {
  const site = website?.replace(/https?:\/\/(www.)?/, '') || 'Unlighthouse'
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
