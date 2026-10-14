<script setup lang="ts">
import type { ReportCoverage } from '~/features/scan/pack-presentation'
import { categoryCoverageSummary } from '~/features/scan/pack-presentation'

const props = defineProps<{ coverage: ReportCoverage, findings: number }>()
const summary = computed(() => categoryCoverageSummary(props.coverage, props.findings))
</script>

<template>
  <div class="space-y-2 text-sm text-muted">
    <p>{{ summary.scope }}</p>
    <p v-if="summary.missing">
      {{ summary.missing }}
    </p>
    <UiEmptyState v-if="summary.title" icon="search" :title="summary.title" compact />
  </div>
</template>
