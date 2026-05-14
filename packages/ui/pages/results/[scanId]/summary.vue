<script setup lang="ts">
// D-028 tier-1 view — renders the `overview` pack output as a dedicated
// page. Mirrors the agent's `scan.summary` entry point so a human sees
// exactly what an MCP client would.

import { useScanSummary } from '~/composables/useScanSummary'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)
const { data: summary, pending, error } = useScanSummary(scanId)

function scorePill(score: number | null | undefined) {
  if (score == null)
    return { text: '—', cls: 'text-dimmed' }
  const pct = Math.round(score * 100)
  if (score >= 0.9)
    return { text: String(pct), cls: 'text-success' }
  if (score >= 0.5)
    return { text: String(pct), cls: 'text-warning' }
  return { text: String(pct), cls: 'text-error' }
}

function categoryLabel(cat: string) {
  if (cat === 'best-practices')
    return 'Best Practices'
  if (cat === 'seo')
    return 'SEO'
  return cat.charAt(0).toUpperCase() + cat.slice(1)
}

function routeName(name: string | null) {
  return name ?? '/'
}
</script>

<template>
  <div>
    <PageError v-if="error" :title="error.message" />

    <div v-else-if="pending && !summary" class="space-y-4">
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-48 w-full" />
    </div>

    <div v-else-if="summary" class="space-y-10">
      <!-- Primary: hero score + distribution -->
      <section>
        <div class="flex items-baseline gap-8 mb-2">
          <div>
            <p class="text-xs text-dimmed uppercase tracking-widest mb-1">
              Avg score
            </p>
            <div class="flex items-baseline gap-3">
              <span
                class="text-6xl font-semibold nums-tabular leading-none"
                :class="scorePill(summary.avgScore).cls"
              >
                {{ scorePill(summary.avgScore).text }}
              </span>
              <span class="text-sm text-muted">
                across {{ summary.routesScanned }} route{{ summary.routesScanned === 1 ? '' : 's' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Distribution bar -->
        <div class="mt-6 max-w-2xl">
          <p class="text-xs text-dimmed uppercase tracking-widest mb-2">
            Distribution
          </p>
          <div class="h-4 rounded-md overflow-hidden flex bg-elevated/40 ring-1 ring-default">
            <div
              v-if="summary.distribution.passing"
              class="bg-success/75 transition-[width]"
              :style="{ width: `${(summary.distribution.passing / summary.routesScanned) * 100}%` }"
            />
            <div
              v-if="summary.distribution.needsWork"
              class="bg-warning/75 transition-[width]"
              :style="{ width: `${(summary.distribution.needsWork / summary.routesScanned) * 100}%` }"
            />
            <div
              v-if="summary.distribution.poor"
              class="bg-error/75 transition-[width]"
              :style="{ width: `${(summary.distribution.poor / summary.routesScanned) * 100}%` }"
            />
          </div>
          <div class="flex justify-between mt-2 text-xs nums-tabular text-muted">
            <span class="text-success">{{ summary.distribution.passing }} passing</span>
            <span class="text-warning">{{ summary.distribution.needsWork }} needs work</span>
            <span class="text-error">{{ summary.distribution.poor }} poor</span>
          </div>
        </div>
      </section>

      <!-- Secondary: category averages + worst routes -->
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardCard title="Category averages">
          <ul class="divide-y divide-default">
            <li
              v-for="(score, cat) in summary.categoryAverages"
              :key="cat"
              class="flex items-center justify-between py-2.5 px-1"
            >
              <span class="text-sm text-default">{{ categoryLabel(cat) }}</span>
              <span class="font-mono text-sm nums-tabular" :class="scorePill(score).cls">
                {{ scorePill(score).text }}
              </span>
            </li>
          </ul>
        </DashboardCard>

        <DashboardCard title="Worst routes">
          <div v-if="!summary.worstRoutes.length" class="text-sm text-muted px-1 py-3">
            No scored routes yet.
          </div>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="r in summary.worstRoutes"
              :key="r.url"
              class="flex items-center justify-between py-2.5 px-1 gap-3"
            >
              <div class="min-w-0 flex-1">
                <p class="font-mono text-xs text-default truncate">
                  {{ r.url }}
                </p>
                <p v-if="r.category" class="text-[11px] text-dimmed mt-0.5">
                  {{ categoryLabel(r.category) }}
                </p>
              </div>
              <span class="font-mono text-sm nums-tabular shrink-0" :class="scorePill(r.score).cls">
                {{ scorePill(r.score).text }}
              </span>
            </li>
          </ul>
        </DashboardCard>
      </section>

      <!-- Tertiary: template groups -->
      <section>
        <DashboardCard title="Template groups">
          <div v-if="!summary.templateGroups.length" class="text-sm text-muted px-1 py-3">
            No template-grouped routes — add a route-definitions seed to see grouping.
          </div>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="g in summary.templateGroups"
              :key="g.routeName ?? '__null'"
              class="flex items-center justify-between py-2.5 px-1 gap-3"
            >
              <div class="min-w-0 flex-1">
                <p class="font-mono text-sm text-default truncate">
                  {{ routeName(g.routeName) }}
                </p>
                <p class="text-[11px] text-dimmed mt-0.5 nums-tabular">
                  {{ g.routes }} route{{ g.routes === 1 ? '' : 's' }}
                </p>
              </div>
              <span class="font-mono text-sm nums-tabular shrink-0" :class="scorePill(g.avgScore).cls">
                {{ scorePill(g.avgScore).text }}
              </span>
            </li>
          </ul>
        </DashboardCard>
      </section>
    </div>
  </div>
</template>
