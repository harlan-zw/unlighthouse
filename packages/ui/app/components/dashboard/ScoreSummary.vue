<script setup lang="ts">
import type { DashboardSummary } from '@unlighthouse/contracts'

defineProps<{
  summary: DashboardSummary | null
}>()
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <ScoreCard
      title="Performance"
      :score="summary?.performance.avgScore ?? null"
      :issues="summary?.performance.issues"
      icon="lucide:gauge"
    />
    <ScoreCard
      title="Accessibility"
      :score="summary?.accessibility.avgScore ?? null"
      :issues="summary?.accessibility.issues"
      icon="lucide:accessibility"
    />
    <ScoreCard
      title="Best Practices"
      :score="summary?.bestPractices.avgScore ?? null"
      :issues="summary?.bestPractices.issues"
      icon="lucide:shield-check"
    />
    <ScoreCard
      title="SEO"
      :score="summary?.seo.avgScore ?? null"
      :issues="summary?.seo.issues"
      icon="lucide:search"
    />
  </div>
</template>
