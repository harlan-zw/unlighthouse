<script setup lang="ts">
import type { SeoReport } from '@unlighthouse/contracts/packs'
import type { UiTableColumn } from '#layers/design-system/app/utils/ui-table'
import { SeoReportSchema } from '@unlighthouse/contracts/packs'
import { h } from 'vue'
import ReportCoverage from '~/features/scan/components/ReportCoverage.vue'

const props = defineProps<{ report: unknown, scanBase?: string }>()

const report = computed(() => SeoReportSchema.parse(props.report))

type RouteCheckRow = SeoReport['routeChecks'][number]
const routeCheckColumns: UiTableColumn<RouteCheckRow>[] = [
  {
    accessorKey: 'url',
    header: 'URL',
    meta: { headClass: 'min-w-[18rem]' },
    cell: ({ row }) => h('span', { class: 'block min-w-[18rem] max-w-[32rem] font-mono text-xs break-words' }, row.original.url),
  },
  {
    accessorKey: 'passes',
    header: 'Passes',
    meta: { align: 'right', headClass: 'w-20' },
    cell: ({ row }) => h('span', { class: 'tabular-nums text-success' }, String(row.original.passes)),
  },
  {
    accessorKey: 'fails',
    header: 'Fails',
    meta: { align: 'right', headClass: 'w-20' },
    cell: ({ row }) => h('span', { class: `tabular-nums ${row.original.fails > 0 ? 'text-error' : ''}` }, String(row.original.fails)),
  },
  {
    accessorKey: 'crawlability',
    header: 'Crawlability checks',
    meta: { headClass: 'w-20' },
    cell: ({ row }) => h('span', { class: row.original.crawlability === 'pass' ? 'text-success' : row.original.crawlability === 'fail' ? 'text-error' : 'text-muted' }, row.original.crawlability === 'unknown' ? 'Unavailable' : row.original.crawlability === 'pass' ? 'Passed' : 'Failed'),
  },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-end">
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes?sort=scoreSeo:asc`">
        View routes
      </UiButton>
    </div>

    <p class="text-sm text-muted">
      Based on Lighthouse is-crawlable, HTTP status, and robots.txt checks.
    </p>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UiStat card title="Crawlability checks" :value="report.crawlabilityPercent ?? 'Unavailable'" :suffix="report.crawlabilityPercent == null ? '' : '%'" :animated-value="false" />
      <UiStat card title="URLs passing crawlability checks" :value="report.passingCrawlabilityRoutes" :animated-value="false" />
      <UiStat card title="URLs with crawlability failures" :value="report.failingCrawlabilityRoutes" :animated-value="false" />
      <UiStat card title="URLs with unavailable crawlability checks" :value="report.unknownCrawlabilityRoutes" :animated-value="false" />
    </div>

    <!-- Findings via the shared accordion. -->
    <FindingsAccordion :findings="report.findings" title="SEO Issues" />

    <!-- Per-route checks table (SEO-specific again). -->
    <UiCard v-if="report.routeChecks.length" size="sm">
      <template #header>
        <h2 class="text-label text-muted">
          Route Checks
        </h2>
      </template>
      <UiTable
        :columns="routeCheckColumns"
        :data="report.routeChecks"
        disable-pagination
        tabindex="0"
        role="region"
        aria-label="Route Checks"
        label="Route Checks"
        class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </UiCard>

    <ReportCoverage :coverage="report.coverage" :findings="report.findings.length" />
  </div>
</template>
