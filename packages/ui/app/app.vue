<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const colorMode = useColorMode()

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
