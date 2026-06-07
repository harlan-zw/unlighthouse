<script setup lang="ts">
const route = useRoute()
const initialUrl = (route.query.url as string) || ''
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6">
    <div>
      <h1 class="text-title">New Scan</h1>
      <p class="text-sm text-muted-foreground">Enter a website URL to start a Lighthouse audit.</p>
    </div>

    <NewScanForm :initial-url="initialUrl" />
  </div>
</template>
