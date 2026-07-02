<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const colorMode = useColorMode()

// On <html> so the DS compound selectors (.light.dashboard-theme / .dark.dashboard-theme)
// match alongside the color-mode class @nuxtjs/color-mode sets there.
useHead({ htmlAttrs: { class: 'dashboard-theme' } })

usePageTitle()
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster position="bottom-right" rich-colors :theme="colorMode.value === 'dark' ? 'dark' : 'light'" />
  </UApp>
</template>
