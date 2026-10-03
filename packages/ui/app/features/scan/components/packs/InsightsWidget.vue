<script setup lang="ts">
import { InsightsReportSchema } from '@unlighthouse/contracts/packs'
import { useAffectedRouteLinks } from '~/features/scan/affected-route-links'
import { formatRouteCount } from '~/features/scan/pack-presentation'

const props = defineProps<{ report: unknown, scanBase?: string }>()
const { affectedRouteLink, linksPending, linksError, refreshLinks } = useAffectedRouteLinks(() => props.scanBase)

const { fmtMs } = createFormatters()

const report = computed(() => InsightsReportSchema.parse(props.report))
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-end">
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes`">
        View routes
      </UiButton>
    </div>

    <UiCard v-if="report.insights?.length" size="sm">
      <QueryError v-if="linksError" :error="linksError" :on-retry="refreshLinks" />
      <p v-else-if="linksPending" role="status" class="pb-2 text-sm text-muted">
        Loading affected route links
      </p>
      <template #header>
        <h2 class="text-label text-dimmed flex items-center gap-2">
          Opportunities
          <UiChip purpose="count">
            {{ report.insights.length }}
          </UiChip>
        </h2>
      </template>
      <div class="space-y-3">
        <div v-for="insight in report.insights" :key="insight.id" class="p-3 border border-default rounded-lg">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">
              {{ insight.title || insight.id }}
            </div>
            <UiChip purpose="count">
              {{ formatRouteCount(insight.routeCount) }} affected
            </UiChip>
          </div>
          <div class="flex gap-1 mt-2 flex-wrap">
            <UiChip v-for="(val, key) in insight.totalSavings" :key="key" purpose="tag">
              {{ key }}: {{ typeof val === 'number' ? fmtMs(val) : val }}
            </UiChip>
          </div>
          <div v-if="insight.worstRoutes?.length" class="mt-2 text-sm text-muted">
            Worst:
            <ul class="font-mono">
              <li v-for="wr in insight.worstRoutes.slice(0, 3)" :key="wr.url">
                <NuxtLink v-if="affectedRouteLink(wr.url)" :to="affectedRouteLink(wr.url)" class="inline-flex min-h-11 items-center break-all hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-h-6">
                  {{ wr.url }}
                </NuxtLink>
                <span v-else class="break-all">{{ wr.url }}</span>
              </li>
              <li v-if="insight.routeCount > Math.min(insight.worstRoutes.length, 3)">
                +{{ insight.routeCount - Math.min(insight.worstRoutes.length, 3) }} more
              </li>
            </ul>
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
