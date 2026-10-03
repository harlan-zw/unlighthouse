<script setup lang="ts">
import type { ApiError } from '~/composables/useApiError'
import type { OverviewFixes } from '~/features/scan/overview-diagnostics'
import { computed } from 'vue'
import { formatRouteCount } from '~/features/scan/pack-presentation'
import { formatMetricValue } from '~/utils/format'

const props = defineProps<{
  fixes: OverviewFixes
  error: ApiError | null
  status: 'idle' | 'pending' | 'success' | 'error'
  scanBase: string
  device?: 'mobile' | 'desktop'
  onRetry: () => void
}>()
const packLink = computed(() => ({ path: `${props.scanBase}/packs/cwv`, query: props.device ? { device: props.device } : {} }))
</script>

<template>
  <UiCard title="Top Core Web Vitals fixes">
    <template #actions>
      <UiButton purpose="link" :to="packLink" class="min-h-11">
        View Core Web Vitals
      </UiButton>
    </template>
    <div class="space-y-4">
      <p class="text-sm text-muted">
        Maximum estimated savings on one route. Estimates are not additive.
      </p>
      <p v-if="!device" class="text-sm text-muted">
        For combined results, fixes use mobile when both devices exist.
      </p>
      <QueryError v-if="error" :error="error" :on-retry="onRetry" />
      <div v-else-if="(status === 'idle' || status === 'pending') && fixes._tag !== 'Ready'" class="space-y-3" role="status">
        <UiLoadingState :rows="3" />
        <p class="text-sm text-muted">
          Loading Core Web Vitals fixes
        </p>
      </div>
      <template v-else-if="fixes._tag === 'Ready'">
        <p v-if="status === 'pending'" role="status" class="text-sm text-muted">
          Refreshing Core Web Vitals fixes
        </p>
        <ol v-if="fixes.fixes.length" class="divide-y divide-default">
          <li v-for="(fix, index) in fixes.fixes" :key="`${fix.insight}:${fix.metric}`" class="flex min-w-0 flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0">
            <span class="w-4 shrink-0 text-sm tabular-nums text-muted">{{ index + 1 }}</span>
            <div class="min-w-0 flex-1 basis-48 space-y-1">
              <p class="text-sm font-medium">
                {{ fix.title || fix.insight }}
              </p>
              <p class="text-sm text-muted">
                {{ formatRouteCount(fix.routeCount) }} affected
              </p>
            </div>
            <div class="ml-8 flex items-baseline gap-2 text-sm sm:ml-0">
              <span class="font-mono text-muted">{{ fix.metric.toUpperCase() }}</span>
              <span class="font-semibold tabular-nums">{{ formatMetricValue(fix.maxImpactMs, fix.metric === 'cls' ? '' : 'ms') }}</span>
            </div>
          </li>
        </ol>
        <p v-else class="py-6 text-sm text-muted">
          No estimated fixes in this report.
        </p>
      </template>
      <UiAlert v-else status="info" title="Core Web Vitals report unavailable" />
    </div>
  </UiCard>
</template>
