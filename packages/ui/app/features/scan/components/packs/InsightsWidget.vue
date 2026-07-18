<script setup lang="ts">
import { InsightsReportSchema } from '@unlighthouse/contracts/packs'

const props = defineProps<{ report: unknown, scanBase?: string }>()

const { fmtMs } = createFormatters()

const report = computed(() => InsightsReportSchema.parse(props.report))
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Performance Insights
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes`">
        View routes
      </UiButton>
    </div>

    <UiCard v-if="report.insights?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed flex items-center gap-2">
          Opportunities
          <UiChip purpose="count">
            {{ report.insights.length }}
          </UiChip>
        </h3>
      </template>
      <div class="space-y-3">
        <div v-for="insight in report.insights" :key="insight.id" class="p-3 border rounded-lg">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">
              {{ insight.title || insight.id }}
            </div>
            <UiChip purpose="count">
              {{ insight.routeCount }} routes
            </UiChip>
          </div>
          <div class="flex gap-1 mt-2 flex-wrap">
            <UiChip v-for="(val, key) in insight.totalSavings" :key="key" purpose="tag">
              {{ key }}: {{ typeof val === 'number' ? fmtMs(val) : val }}
            </UiChip>
          </div>
          <div v-if="insight.worstRoutes?.length" class="mt-2 text-xs text-muted">
            Worst: <span v-for="(wr, i) in insight.worstRoutes.slice(0, 3)" :key="wr.url" class="font-mono">{{ wr.url }}{{ Number(i) < Math.min(insight.worstRoutes.length, 3) - 1 ? ', ' : '' }}</span>
          </div>
        </div>
      </div>
    </UiCard>

    <UiEmptyState
      v-else
      icon="zap"
      title="0 performance insights across audited routes"
      description="Lighthouse surfaced no insight-based opportunities for this scan."
      compact
    />
  </div>
</template>
