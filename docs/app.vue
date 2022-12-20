<script lang="ts" setup>
const route = useRoute()
</script>

<template>
  <AppLayout>
    <SeoKit />
    <OgImageScreenshot v-if="route.path !== '/'" />
    <NuxtPage />
  </AppLayout>
</template>
