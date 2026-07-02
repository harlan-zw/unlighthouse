<script setup lang="ts">
import NewScanForm from '~/features/scan/components/NewScanForm.vue'

const route = useRoute()
const initialUrl = (route.query.url as string) || ''

usePageTitle('Run Scan')
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6">
    <div>
      <h1 class="text-title">
        Run scan
      </h1>
      <p class="text-sm text-muted">
        Enter a URL to audit routes with Lighthouse.
      </p>
    </div>

    <NewScanForm :initial-url="initialUrl" />
  </div>
</template>
