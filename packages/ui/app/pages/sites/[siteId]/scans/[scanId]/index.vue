<script setup lang="ts">
// /sites/{slug}/scans/{id} → its overview.
const route = useRoute()
await navigateTo(`/sites/${route.params.siteId}/scans/${route.params.scanId}/overview`, { replace: true })
</script>

<template>
  <div />
</template>
