<script lang="ts" setup>
const route = useRoute()
useSeoKit()
</script>

<template>
  <AppLayout>
    <OgImageScreenshot v-if="route.path !== '/'" />
    <NuxtPage />
  </AppLayout>
</template>
