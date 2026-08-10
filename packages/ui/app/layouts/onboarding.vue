<script setup lang="ts">
const colorMode = useColorMode()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="relative isolate min-h-dvh bg-default text-default">
    <UiAtmosphere preset="front-door" palette="blue" />

    <a
      href="#main-content"
      class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-default focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:ring-2 focus-visible:ring-primary"
    >Skip to content</a>

    <div class="fixed top-3 right-3 z-40">
      <UiButton
        purpose="quiet"
        class="size-11 justify-center"
        :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        :icon="colorMode.value === 'dark' ? 'light' : 'dark'"
        @click="toggleColorMode"
      />
    </div>

    <main id="main-content" tabindex="-1" class="relative z-10 min-h-dvh overflow-y-auto px-4 py-10 sm:px-6 sm:py-14">
      <div class="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-xl items-start justify-center sm:min-h-[calc(100dvh-7rem)] sm:items-center">
        <slot />
      </div>
    </main>
  </div>
</template>
