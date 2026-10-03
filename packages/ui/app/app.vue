<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import SidebarShell from '~/components/SidebarShell.vue'

const colorMode = useColorMode()
const route = useRoute()
// Keep the shell mounted when site, scan, and agent content changes layouts.
const primaryLayout = computed(() => ['default', 'site', 'scan'].includes(String(route.meta.layout || 'default')))

// On <html> so the DS compound selectors (.light.dashboard-theme / .dark.dashboard-theme)
// match alongside the color-mode class @nuxtjs/color-mode sets there.
useHead({ htmlAttrs: { class: 'dashboard-theme' } })

usePageTitle()
</script>

<template>
  <UApp>
    <component :is="primaryLayout ? SidebarShell : 'div'">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </component>
    <Toaster position="bottom-right" rich-colors close-button :theme="colorMode.value === 'dark' ? 'dark' : 'light'" />
  </UApp>
</template>
