<script setup lang="ts">
// `cwv` pack view — Core Web Vitals p75 verdicts + top fix list. D-028
// layered-output tier 2.

import type { CwvReport, MetricSnapshot } from '@unlighthouse/core/packs'
import { usePackRun } from '~/composables/usePackRun'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)
const { data: run, pending, error } = usePackRun(scanId, 'cwv')

const report = computed<CwvReport | null>(() => (run.value?.report ?? null) as CwvReport | null)

// Core metrics rendered as hero cards; auxiliary metrics fold below.
const coreMetrics = computed(() => report.value?.metrics.filter(m => ['lcp', 'cls', 'inp'].includes(m.metric)) ?? [])
const auxMetrics = computed(() => report.value?.metrics.filter(m => !['lcp', 'cls', 'inp'].includes(m.metric)) ?? [])

function metricLabel(k: string) {
  return k.toUpperCase()
}

function metricFullName(k: string) {
  switch (k) {
    case 'lcp': return 'Largest Contentful Paint'
    case 'cls': return 'Cumulative Layout Shift'
    case 'inp': return 'Interaction to Next Paint'
    case 'fcp': return 'First Contentful Paint'
    case 'ttfb': return 'Time to First Byte'
    case 'tbt': return 'Total Blocking Time'
    case 'si': return 'Speed Index'
    default: return k
  }
}

// LCP/INP/FCP/TBT/SI/TTFB in ms, CLS dimensionless.
function formatMetric(k: string, v: number | null) {
  if (v == null)
    return '—'
  if (k === 'cls')
    return v.toFixed(3)
  if (v < 1000)
    return `${Math.round(v)} ms`
  return `${(v / 1000).toFixed(2)} s`
}

function verdictClasses(v: MetricSnapshot['verdict']) {
  switch (v) {
    case 'good': return { text: 'text-success', bg: 'bg-success/15', dot: 'bg-success' }
    case 'needsImprovement': return { text: 'text-warning', bg: 'bg-warning/15', dot: 'bg-warning' }
    case 'poor': return { text: 'text-error', bg: 'bg-error/15', dot: 'bg-error' }
    default: return { text: 'text-dimmed', bg: 'bg-muted', dot: 'bg-muted' }
  }
}

function verdictLabel(v: MetricSnapshot['verdict']) {
  if (v === 'needsImprovement')
    return 'needs work'
  return v ?? '—'
}

function distributionPct(snap: MetricSnapshot, bucket: 'good' | 'needsImprovement' | 'poor') {
  const total = snap.distribution.good + snap.distribution.needsImprovement + snap.distribution.poor
  if (!total)
    return 0
  return (snap.distribution[bucket] / total) * 100
}
</script>

<template>
  <div>
    <PageError v-if="error" :title="error.message" />

    <div v-else-if="pending && !report" class="space-y-4">
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <div v-else-if="report" class="space-y-10">
      <!-- Primary: site-wide CWV verdict + core p75 cards -->
      <section>
        <div class="flex items-baseline gap-4 flex-wrap mb-6">
          <div>
            <p class="text-xs text-dimmed uppercase tracking-widest mb-1">
              Site passes Core Web Vitals
            </p>
            <p
              class="text-3xl font-semibold leading-none"
              :class="report.passesCoreWebVitals ? 'text-success' : 'text-error'"
            >
              {{ report.passesCoreWebVitals ? 'Yes' : 'No' }}
            </p>
          </div>
          <p class="text-sm text-muted ml-2">
            p75 across {{ report.routesAnalysed }} routes — Google's pass rule.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            v-for="snap in coreMetrics"
            :key="snap.metric"
            class="ring-1 ring-default rounded-xl bg-elevated/40 p-6 space-y-3"
          >
            <div class="flex items-baseline justify-between">
              <p class="text-xs text-dimmed uppercase tracking-widest font-mono">
                {{ metricLabel(snap.metric) }}
              </p>
              <span
                v-if="snap.verdict"
                class="text-[10px] uppercase tracking-widest rounded-md px-1.5 py-0.5 font-medium"
                :class="[verdictClasses(snap.verdict).text, verdictClasses(snap.verdict).bg]"
              >
                {{ verdictLabel(snap.verdict) }}
              </span>
            </div>
            <p class="text-3xl font-semibold nums-tabular leading-none" :class="verdictClasses(snap.verdict).text">
              {{ formatMetric(snap.metric, snap.p75) }}
            </p>
            <p class="text-[11px] text-dimmed">
              p75 · {{ metricFullName(snap.metric) }}
            </p>

            <!-- Distribution bar -->
            <div class="space-y-1 pt-2">
              <div class="h-2 rounded-md overflow-hidden flex bg-elevated/40 ring-1 ring-default">
                <div
                  v-if="snap.distribution.good"
                  class="bg-success/75 transition-[width]"
                  :style="{ width: `${distributionPct(snap, 'good')}%` }"
                />
                <div
                  v-if="snap.distribution.needsImprovement"
                  class="bg-warning/75 transition-[width]"
                  :style="{ width: `${distributionPct(snap, 'needsImprovement')}%` }"
                />
                <div
                  v-if="snap.distribution.poor"
                  class="bg-error/75 transition-[width]"
                  :style="{ width: `${distributionPct(snap, 'poor')}%` }"
                />
              </div>
              <div class="flex justify-between text-[10px] text-dimmed nums-tabular">
                <span class="text-success">{{ snap.distribution.good }} good</span>
                <span class="text-warning">{{ snap.distribution.needsImprovement }} NI</span>
                <span class="text-error">{{ snap.distribution.poor }} poor</span>
              </div>
            </div>

            <!-- Worst-3 routes -->
            <div v-if="snap.worstRoutes.length" class="pt-2 border-t border-default">
              <p class="text-[10px] text-dimmed uppercase tracking-widest mb-1.5">
                Worst {{ snap.worstRoutes.length }}
              </p>
              <ul class="space-y-1">
                <li
                  v-for="r in snap.worstRoutes"
                  :key="r.url"
                  class="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span class="font-mono text-dimmed truncate">{{ r.url.replace(/^https?:\/\/[^/]+/, '') || '/' }}</span>
                  <span class="font-mono shrink-0 nums-tabular" :class="verdictClasses(snap.verdict).text">
                    {{ formatMetric(snap.metric, r.value) }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Secondary: top fixes -->
      <section>
        <DashboardCard title="Top fixes" :count="report.topFixes.length">
          <div v-if="!report.topFixes.length" class="text-sm text-muted px-1 py-6 text-center">
            No metric-saving insights flagged. Either every audit passes or this scan was run before Lighthouse 12 insights were available.
          </div>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="fix in report.topFixes"
              :key="fix.insight"
              class="py-3 px-1 flex items-start gap-3"
            >
              <span
                class="text-[10px] uppercase tracking-widest rounded-md px-1.5 py-0.5 font-mono shrink-0 mt-0.5"
                :class="[verdictClasses('needsImprovement').text, verdictClasses('needsImprovement').bg]"
              >
                {{ metricLabel(fix.metric) }}
              </span>

              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-default">
                  {{ fix.title }}
                </p>
                <p class="text-[11px] text-dimmed font-mono mt-0.5">
                  {{ fix.insight }} · {{ fix.routeCount }} route{{ fix.routeCount === 1 ? '' : 's' }}
                </p>
              </div>

              <div class="shrink-0 text-right">
                <p class="text-sm font-medium nums-tabular text-success">
                  −{{ fix.maxImpactMs }} ms
                </p>
                <p class="text-[10px] text-dimmed">
                  best route
                </p>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>

      <!-- Tertiary: auxiliary metrics -->
      <section v-if="auxMetrics.length">
        <DashboardCard title="Auxiliary metrics">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 p-2">
            <div v-for="snap in auxMetrics" :key="snap.metric">
              <p class="text-[10px] text-dimmed uppercase tracking-widest font-mono mb-0.5">
                {{ metricLabel(snap.metric) }}
              </p>
              <p class="text-lg font-medium nums-tabular" :class="verdictClasses(snap.verdict).text">
                {{ formatMetric(snap.metric, snap.p75) }}
              </p>
              <p v-if="snap.verdict" class="text-[10px] mt-0.5" :class="verdictClasses(snap.verdict).text">
                {{ verdictLabel(snap.verdict) }}
              </p>
            </div>
          </div>
        </DashboardCard>
      </section>
    </div>
  </div>
</template>
