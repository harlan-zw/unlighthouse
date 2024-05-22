<script setup lang="ts">
const { $ads } = useNuxtApp()
</script>

<template>
  <div class="space-y-3">
    <AdsFallback v-if="$ads.adBlocked.value" />
    <AdsCarbon v-else :key="$route.path" />
  </div>
</template>
