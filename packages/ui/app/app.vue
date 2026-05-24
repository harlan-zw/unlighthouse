<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const colorMode = useColorMode()
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster position="bottom-right" rich-colors :theme="colorMode.value === 'dark' ? 'dark' : 'light'" />
</template>
