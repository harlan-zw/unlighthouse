<script setup lang="ts">
// Simple dashboard page to test build
const reports = computed(() => unlighthouseReports.value || [])
const hasReports = computed(() => reports.value.length > 0)
</script>

<template>
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-6">Lighthouse Reports</h1>

    <div v-if="!hasReports" class="text-center py-12">
      <div class="text-6xl mb-4">📊</div>
      <h2 class="text-2xl font-bold">No Reports Available</h2>
      <p class="text-gray-600 dark:text-gray-400 mt-2">
        Run Unlighthouse to generate reports.
      </p>
    </div>

    <div v-else class="space-y-4">
      <p class="text-gray-600 dark:text-gray-400">
        Found {{ reports.length }} reports
      </p>
    </div>
  </div>
</template>
