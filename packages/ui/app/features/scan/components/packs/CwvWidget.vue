<script setup lang="ts">
import { CwvReportSchema } from '@unlighthouse/contracts/packs'
import MeasurementSources from '~/features/scan/components/MeasurementSources.vue'
import { formatInsightSavings, formatRouteCount, performanceSourceLabel } from '~/features/scan/pack-presentation'

const props = defineProps<{ report: unknown, scanBase: string }>()

const { fmtMs } = createFormatters()

const report = computed(() => CwvReportSchema.parse(props.report))

function verdictColor(verdict: string | null) {
  if (verdict === 'good')
    return 'text-success'
  if (verdict === 'needsImprovement')
    return 'text-warning'
  if (verdict == null)
    return 'text-muted'
  return 'text-error'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-end">
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes?sort=scorePerformance:asc`">
        View routes
      </UiButton>
    </div>

    <div v-if="report.metrics?.length" class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <div v-for="m in report.metrics" :key="m.metric" class="rounded-lg border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
        <div class="text-xs text-muted mb-1">
          {{ m.metric?.toUpperCase() }}
        </div>
        <div class="numerals-display text-2xl" :class="verdictColor(m.verdict)">
          {{ m.metric === 'cls' ? formatMetricValue(m.p75, '') : fmtMs(m.p75) }}
        </div>
        <div class="text-xs text-muted mt-1">
          p75 across {{ m.coverage.analysed }} measured URLs
        </div>
        <div class="text-xs text-muted mt-1">
          {{ performanceSourceLabel(m.source) }}
        </div>
        <div class="text-xs text-muted mt-1">
          Measurements available for {{ m.coverage.analysed }} of {{ m.coverage.eligible }} entries
        </div>
        <div v-if="m.coverage.missing > 0" class="text-xs text-muted mt-1">
          {{ m.coverage.missing }} measurements unavailable
        </div>
        <MeasurementSources :sources="m.sources" />
        <div class="flex flex-wrap justify-center gap-1 mt-2">
          <UiChip purpose="status" status="success">
            {{ m.distribution?.good ?? 0 }} good
          </UiChip>
          <UiChip purpose="status" status="warning">
            {{ m.distribution?.needsImprovement ?? 0 }} Needs improvement
          </UiChip>
          <UiChip purpose="status" status="error">
            {{ m.distribution?.poor ?? 0 }} poor
          </UiChip>
        </div>
      </div>
    </div>

    <UiCard v-if="report.topFixes?.length" size="sm">
      <template #header>
        <h2 class="text-label text-muted">
          Lighthouse insights
        </h2>
      </template>
      <div class="space-y-3">
        <div v-for="fix in report.topFixes.slice(0, 10)" :key="`${fix.insight}:${fix.metric}`" class="flex items-start gap-3 p-3 border border-default rounded-lg">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ fix.title || fix.insight }}
            </div>
            <div class="text-xs text-muted mt-0.5">
              {{ formatRouteCount(fix.routeCount) }} affected · {{ fix.metric.toUpperCase() }}
            </div>
          </div>
          <div class="flex gap-1 flex-wrap justify-end">
            <UiChip purpose="count">
              {{ formatInsightSavings(fix.metric, fix.maxImpactMs) }} max impact
            </UiChip>
          </div>
        </div>
      </div>
    </UiCard>

    <UiEmptyState
      v-if="!report.metrics?.length && !report.topFixes?.length"
      icon="gauge"
      title="No performance metrics captured"
      description="Run another scan to collect performance metrics."
      compact
    />
  </div>
</template>
