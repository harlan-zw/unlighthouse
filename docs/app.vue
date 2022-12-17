<script lang="ts" setup>
const route = useRoute()
</script>

<template>
  <AppLayout>
    <OgImageScreenshot v-if="route.path !== '/'" />
    <SeoKit />
    <NuxtPage />
  </AppLayout>
</template>
