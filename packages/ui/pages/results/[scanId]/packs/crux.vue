<script setup lang="ts">
// `crux` pack view — surfaces the lab-vs-field gap analysis produced by the
// CrUX pack (`packages/core/src/packs/crux.ts`).
//
// The headline story is the three buckets the pack computes per
// `(url, formFactor, metric)`:
//   * goodLabPoorField — lab said fine, real users disagree (most damning)
//   * poorLabGoodField — lab was pessimistic, field is fine (tuning hint)
//   * aligned          — both substrates agree
//
// We render those buckets as three sections plus a per-route detail table
// inside each. The time-series chart promised by issue #349 Phase 11 is
// scoped to a follow-up PR — this page intentionally stays "clean cards +
// tables" so it can ship without a charting dependency.

import type { CruxReport, GapEntry } from '@unlighthouse/core/packs'
import { computed } from 'vue'
import { usePackRun } from '~/composables/usePackRun'
import { formatMetric, formFactorLabel, groupGapsByRoute, shortPath, verdictClasses, verdictLabel } from '~/utils/cruxGaps'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)
const { data: run, pending, error } = usePackRun(scanId, 'crux')

const report = computed<CruxReport | null>(() => (run.value?.report ?? null) as CruxReport | null)

// "API key missing" empty state — the pack returns every finding with
// `source: 'none'` when no CRUX_API_KEY is resolvable. We treat that
// uniform-none case as a configuration signal and surface the help text
// instead of a wall of dashes.
const hasNoApiKey = computed(() => {
  const r = report.value
  if (!r)
    return false
  if (!r.findings.length)
    return false
  return r.findings.every(f => f.source === 'none')
})

// Pre-grouped buckets for the template — each bucket shows one row per
// (url, formFactor) with the per-metric verdicts collapsed inline.
const goodLabPoorField = computed(() => groupGapsByRoute(report.value?.gapAnalysis.goodLabPoorField ?? []))
const poorLabGoodField = computed(() => groupGapsByRoute(report.value?.gapAnalysis.poorLabGoodField ?? []))
const aligned = computed(() => groupGapsByRoute(report.value?.gapAnalysis.aligned ?? []))

const totalGapRows = computed(() =>
  (report.value?.gapAnalysis.goodLabPoorField.length ?? 0)
  + (report.value?.gapAnalysis.poorLabGoodField.length ?? 0)
  + (report.value?.gapAnalysis.aligned.length ?? 0),
)

// "Most-impactful first" sort for the damning bucket: rank rows by the
// numeric distance between lab and field on the same metric (after
// normalising CLS so it sits in the same magnitude as the ms-scaled
// metrics). Pure presentation — doesn't affect the underlying data.
function impactScore(entry: GapEntry): number {
  if (entry.labValue == null || entry.fieldValue == null)
    return 0
  const scale = entry.metric === 'cls' ? 10_000 : 1 // 0.1 CLS ≈ 1000 ms
  return Math.abs(entry.fieldValue - entry.labValue) * scale
}

const sortedDamning = computed(() => {
  return [...goodLabPoorField.value].sort((a, b) => {
    const aMax = Math.max(...a.metrics.map(impactScore), 0)
    const bMax = Math.max(...b.metrics.map(impactScore), 0)
    return bMax - aMax
  })
})

function metricLabel(k: GapEntry['metric']) {
  return k.toUpperCase()
}
</script>

<template>
  <div>
    <PageError v-if="error" :title="error.message" />

    <div v-else-if="pending && !report" class="space-y-4">
      <UiSkeleton class="h-24 w-full" />
      <UiSkeleton class="h-64 w-full" />
    </div>

    <div v-else-if="report" class="space-y-10">
      <!-- Header -->
      <section>
        <p class="text-xs text-dimmed uppercase tracking-widest mb-1">
          Field data (CrUX)
        </p>
        <h1 class="text-2xl font-semibold leading-tight text-highlighted">
          Lab vs field — what real users actually see
        </h1>
        <p class="text-sm text-muted mt-1 max-w-2xl">
          Real-user p75 from Chrome users, joined to the lab numbers from
          this scan. Single-run Lighthouse can be misleading; field data
          tells you whether real visitors share its verdict.
        </p>
      </section>

      <!-- No API key empty state -->
      <section v-if="hasNoApiKey">
        <div class="rounded-lg ring-1 ring-default bg-elevated/40 p-6 max-w-2xl">
          <div class="flex items-start gap-3">
            <UIcon name="i-heroicons-key" class="size-5 text-dimmed mt-0.5 shrink-0" />
            <div>
              <h2 class="text-base font-medium text-default mb-1">
                CrUX API key required
              </h2>
              <p class="text-sm text-muted">
                Set the <code class="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded">CRUX_API_KEY</code>
                environment variable (or
                <code class="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded">auditor.cruxApiKey</code>
                in your config) and re-run this scan to populate the field
                data. The CrUX API is free for public traffic.
              </p>
              <p class="text-xs text-dimmed mt-3">
                Without a key the pack still runs — every route just lands
                in the "no field data" bucket, which is what you're looking
                at right now.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Pack summary stats -->
      <section v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="rounded-xl ring-1 ring-default bg-elevated/40 p-4">
          <p class="text-[10px] text-dimmed uppercase tracking-widest font-mono mb-1">
            Routes analysed
          </p>
          <p class="text-2xl font-semibold nums-tabular text-highlighted">
            {{ report.routesAnalysed }}
          </p>
        </div>
        <div class="rounded-xl ring-1 ring-default bg-elevated/40 p-4">
          <p class="text-[10px] text-dimmed uppercase tracking-widest font-mono mb-1">
            Origin fallback
          </p>
          <p class="text-2xl font-semibold nums-tabular" :class="report.hasOriginFallback ? 'text-warning' : 'text-success'">
            {{ report.hasOriginFallback ? 'used' : 'no' }}
          </p>
        </div>
        <div class="rounded-xl ring-1 ring-default bg-elevated/40 p-4">
          <p class="text-[10px] text-dimmed uppercase tracking-widest font-mono mb-1">
            Field verdict
          </p>
          <p class="text-sm font-mono nums-tabular">
            <span class="text-success">{{ report.severityCounts.good }}</span>
            <span class="text-dimmed mx-1">·</span>
            <span class="text-warning">{{ report.severityCounts.needsImprovement }}</span>
            <span class="text-dimmed mx-1">·</span>
            <span class="text-error">{{ report.severityCounts.poor }}</span>
          </p>
          <p class="text-[10px] text-dimmed mt-1">
            good · NI · poor
          </p>
        </div>
        <div class="rounded-xl ring-1 ring-default bg-elevated/40 p-4">
          <p class="text-[10px] text-dimmed uppercase tracking-widest font-mono mb-1">
            Gap rows
          </p>
          <p class="text-2xl font-semibold nums-tabular text-highlighted">
            {{ totalGapRows }}
          </p>
        </div>
      </section>

      <!-- No gaps at all -->
      <section v-if="!hasNoApiKey && totalGapRows === 0">
        <div class="rounded-lg ring-1 ring-default bg-elevated/40 p-6 text-center">
          <UIcon name="i-heroicons-check-circle" class="size-8 text-success mx-auto mb-3" aria-hidden="true" />
          <h2 class="text-base font-medium text-default mb-1">
            No comparable lab/field pairs
          </h2>
          <p class="text-sm text-muted">
            CrUX returned data but nothing lined up with the lab metrics on
            this scan — usually means the (url, device) pairs Lighthouse
            audited aren't in the CrUX dataset yet (low-traffic routes /
            new pages).
          </p>
        </div>
      </section>

      <!-- Damning bucket: lab good, field poor -->
      <section v-if="!hasNoApiKey && sortedDamning.length">
        <DashboardCard
          title="Lab good, field poor"
          icon="i-heroicons-exclamation-triangle"
          :count="sortedDamning.length"
        >
          <p class="text-xs text-muted px-1 pb-3 max-w-3xl">
            Lighthouse passed these routes but Chrome users hit poor real-world
            performance. Sorted by lab/field divergence — biggest gaps first.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="group in sortedDamning"
              :key="group.key"
              class="py-3 px-1 flex items-start gap-3"
            >
              <span
                class="size-2 rounded-full bg-warning shrink-0 mt-2"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 flex-wrap mb-1">
                  <span class="font-mono text-sm text-default truncate">
                    {{ shortPath(group.url) }}
                  </span>
                  <UBadge size="xs" color="neutral" variant="subtle">
                    {{ formFactorLabel(group.formFactor) }}
                  </UBadge>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 mt-2">
                  <div
                    v-for="m in group.metrics"
                    :key="m.metric"
                    class="flex items-baseline gap-2 text-xs"
                  >
                    <span
                      class="font-mono uppercase tracking-wider rounded px-1.5 py-0.5 text-[10px]"
                      :class="[verdictClasses(m.fieldVerdict).text, verdictClasses(m.fieldVerdict).bg]"
                    >
                      {{ metricLabel(m.metric) }}
                    </span>
                    <span class="text-dimmed">lab</span>
                    <span class="nums-tabular font-mono" :class="verdictClasses(m.labVerdict).text">
                      {{ formatMetric(m.metric, m.labValue) }}
                    </span>
                    <span class="text-dimmed">→ field</span>
                    <span class="nums-tabular font-mono" :class="verdictClasses(m.fieldVerdict).text">
                      {{ formatMetric(m.metric, m.fieldValue) }}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>

      <!-- Tuning hint bucket: lab poor, field good -->
      <section v-if="!hasNoApiKey && poorLabGoodField.length">
        <DashboardCard
          title="Lab poor, field good"
          icon="i-heroicons-information-circle"
          :count="poorLabGoodField.length"
        >
          <p class="text-xs text-muted px-1 pb-3 max-w-3xl">
            Lighthouse flagged these routes as poor but real users see
            acceptable performance — usually means the synthetic throttle is
            harsher than your audience's median. Useful as a calibration
            signal, not a fix priority.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="group in poorLabGoodField"
              :key="group.key"
              class="py-3 px-1 flex items-start gap-3"
            >
              <span
                class="size-2 rounded-full bg-info shrink-0 mt-2"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 flex-wrap mb-1">
                  <span class="font-mono text-sm text-default truncate">
                    {{ shortPath(group.url) }}
                  </span>
                  <UBadge size="xs" color="neutral" variant="subtle">
                    {{ formFactorLabel(group.formFactor) }}
                  </UBadge>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 mt-2">
                  <div
                    v-for="m in group.metrics"
                    :key="m.metric"
                    class="flex items-baseline gap-2 text-xs"
                  >
                    <span
                      class="font-mono uppercase tracking-wider rounded px-1.5 py-0.5 text-[10px]"
                      :class="[verdictClasses(m.labVerdict).text, verdictClasses(m.labVerdict).bg]"
                    >
                      {{ metricLabel(m.metric) }}
                    </span>
                    <span class="text-dimmed">lab</span>
                    <span class="nums-tabular font-mono" :class="verdictClasses(m.labVerdict).text">
                      {{ formatMetric(m.metric, m.labValue) }}
                    </span>
                    <span class="text-dimmed">→ field</span>
                    <span class="nums-tabular font-mono" :class="verdictClasses(m.fieldVerdict).text">
                      {{ formatMetric(m.metric, m.fieldValue) }}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>

      <!-- Confidence bucket: lab and field agree -->
      <section v-if="!hasNoApiKey && aligned.length">
        <DashboardCard
          title="Aligned"
          icon="i-heroicons-check-badge"
          :count="aligned.length"
        >
          <p class="text-xs text-muted px-1 pb-3 max-w-3xl">
            Lab and field agree on the verdict. High-confidence rows — when
            this list is small, your lab numbers may be drifting from
            reality.
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="group in aligned"
              :key="group.key"
              class="py-3 px-1 flex items-baseline gap-3"
            >
              <span class="font-mono text-sm text-default truncate flex-1 min-w-0">
                {{ shortPath(group.url) }}
              </span>
              <UBadge size="xs" color="neutral" variant="subtle">
                {{ formFactorLabel(group.formFactor) }}
              </UBadge>
              <div class="flex items-center gap-1.5 shrink-0">
                <span
                  v-for="m in group.metrics"
                  :key="m.metric"
                  class="font-mono uppercase tracking-wider rounded px-1.5 py-0.5 text-[10px]"
                  :class="[verdictClasses(m.labVerdict).text, verdictClasses(m.labVerdict).bg]"
                  :title="`${m.metric.toUpperCase()}: lab ${verdictLabel(m.labVerdict)}, field ${verdictLabel(m.fieldVerdict)}`"
                >
                  {{ metricLabel(m.metric) }}
                </span>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>
    </div>
  </div>
</template>
