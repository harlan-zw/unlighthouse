<script setup lang="ts">
import type { CwvReport } from '@unlighthouse/contracts/packs'
// `pack.run`'s `report` field is typed as the wide built-in-report union (see
// the comment on PackRunCmd in contracts/src/commands/pack.ts) — every widget
// receives it as `unknown` and casts to its own pack's shape at the boundary,
// the same pattern the pre-pivot category pages used per-pack.
const props = defineProps<{ report: unknown, scanBase: string }>()

const { fmtMs } = createFormatters()

const report = computed(() => props.report as CwvReport)

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
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Core Web Vitals
      </h2>
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
          p75 across {{ (m.distribution?.good ?? 0) + (m.distribution?.needsImprovement ?? 0) + (m.distribution?.poor ?? 0) }} routes
        </div>
        <div class="flex justify-center gap-1 mt-2">
          <UiChip purpose="status" status="success">
            {{ m.distribution?.good ?? 0 }} good
          </UiChip>
          <UiChip purpose="status" status="warning">
            {{ m.distribution?.needsImprovement ?? 0 }} NI
          </UiChip>
          <UiChip purpose="status" status="error">
            {{ m.distribution?.poor ?? 0 }} poor
          </UiChip>
        </div>
      </div>
    </div>

    <UiCard v-if="report.topFixes?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">
          Top Fixes (by impact)
        </h3>
      </template>
      <div class="space-y-3">
        <div v-for="fix in report.topFixes.slice(0, 10)" :key="`${fix.insight}:${fix.metric}`" class="flex items-start gap-3 p-3 border rounded-lg">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ fix.title || fix.insight }}
            </div>
            <div class="text-xs text-muted mt-0.5">
              {{ fix.routeCount }} routes affected · {{ fix.metric.toUpperCase() }}
            </div>
          </div>
          <div class="flex gap-1 flex-wrap justify-end">
            <UiChip purpose="count">
              {{ fmtMs(fix.maxImpactMs) }} max impact
            </UiChip>
          </div>
        </div>
      </div>
    </UiCard>

    <UiEmptyState
      v-if="!report.metrics?.length && !report.topFixes?.length"
      icon="gauge"
      title="0 Core Web Vitals metrics captured"
      description="Metrics are captured automatically during a scan — rerun the scan if this looks wrong."
      compact
    />
  </div>
</template>
