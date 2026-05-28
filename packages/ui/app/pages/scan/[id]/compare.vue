<script setup lang="ts">
// Compare moved to its own full-screen experience at /compare/:id.
// Redirect existing deep links so the URL change is transparent and
// any bookmarks still land on the working page.
const route = useRoute()
const scanId = route.params.id as string
const query = { ...route.query }
await navigateTo({ path: `/compare/${scanId}`, query }, { replace: true })
</script>

<template>
  <div />
</template>
