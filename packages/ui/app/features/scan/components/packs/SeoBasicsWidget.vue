<script setup lang="ts">
import type { SeoReport } from '@unlighthouse/contracts/packs'
import type { UiTableColumn } from '#layers/design-system/app/utils/ui-table'
import { SeoReportSchema } from '@unlighthouse/contracts/packs'
import { h } from 'vue'

const props = defineProps<{ report: unknown, scanBase?: string }>()

const report = computed(() => SeoReportSchema.parse(props.report))

type RouteCheckRow = SeoReport['routeChecks'][number]
const UiIconC = resolveComponent('UiIcon')
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
    accessorKey: 'indexable',
    header: 'Indexable',
    meta: { headClass: 'w-20' },
    cell: ({ row }) => h(UiIconC, { name: row.original.indexable ? 'success' : 'error', class: `size-4 ${row.original.indexable ? 'text-success' : 'text-error'}` }),
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

    <!-- Indexability summary cards — SEO-specific. -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UiStat card title="Indexability" :value="report.indexabilityPercent" suffix="%" :value-class="report.indexabilityPercent === 100 ? 'text-success' : report.indexabilityPercent >= 80 ? 'text-warning' : 'text-error'" :animated-value="false" />
      <UiStat card title="Indexable Routes" :value="report.indexableRoutes" value-class="text-success" :animated-value="false" />
      <UiStat card title="Unindexable Routes" :value="report.unindexableRoutes" :value-class="report.unindexableRoutes > 0 ? 'text-error' : 'text-success'" :animated-value="false" />
      <UiStat card title="Routes Analysed" :value="report.routesAnalysed" :animated-value="false" />
    </div>

    <!-- Findings via the shared accordion. -->
    <FindingsAccordion :findings="report.findings" title="SEO Issues" />

    <!-- Per-route checks table (SEO-specific again). -->
    <UiCard v-if="report.routeChecks.length" size="sm">
      <template #header>
        <h3 class="text-label text-muted">
          Route Checks
        </h3>
      </template>
      <UiTable :columns="routeCheckColumns" :data="report.routeChecks" disable-pagination />
    </UiCard>

    <UiEmptyState
      v-if="!report.findings.length && !report.routeChecks.length"
      icon="search"
      title="All routes pass · 0 SEO issues"
      description="No indexability or SEO issues found across the audited routes."
      compact
    />
  </div>
</template>
