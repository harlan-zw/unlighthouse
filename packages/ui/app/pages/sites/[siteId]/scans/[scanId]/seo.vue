<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { SeoReport } from '@unlighthouse/contracts/packs'
import { h } from 'vue'
import CategoryPageShell from '~/features/scan/components/CategoryPageShell.vue'
import PackFindings from '~/features/scan/components/PackFindings.vue'
import { getScanId } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

const scanId = getScanId()

const { data: seoPack, status, error: seoError, refresh: refreshSeo } = useApiQuery('pack.run', () => ({ scanId, pack: 'seo-basics' }))

const report = computed(() => (seoPack.value?.report ?? null) as SeoReport | null)

type RouteCheckRow = SeoReport['routeChecks'][number]
const UiIconC = resolveComponent('UiIcon')
const routeCheckColumns: ColumnDef<RouteCheckRow>[] = [
  {
    accessorKey: 'url',
    header: 'URL',
    cell: ({ row }) => h('span', { class: 'font-mono text-xs truncate block max-w-sm', title: row.original.url }, row.original.url),
  },
  {
    accessorKey: 'passes',
    header: 'Passes',
    align: 'right',
    headClass: 'w-20',
    cell: ({ row }) => h('span', { class: 'tabular-nums text-success' }, String(row.original.passes)),
  },
  {
    accessorKey: 'fails',
    header: 'Fails',
    align: 'right',
    headClass: 'w-20',
    cell: ({ row }) => h('span', { class: `tabular-nums ${row.original.fails > 0 ? 'text-error' : ''}` }, String(row.original.fails)),
  },
  {
    accessorKey: 'indexable',
    header: 'Indexable',
    headClass: 'w-20',
    cell: ({ row }) => h(UiIconC, { name: row.original.indexable ? 'success' : 'error', class: `size-4 ${row.original.indexable ? 'text-success' : 'text-error'}` }),
  },
]
</script>

<template>
  <CategoryPageShell
    title="SEO"
    pack="seo-basics"
    :status="status"
    :error="seoError"
    :on-retry="refreshSeo"
    :report="report"
    empty-message="No SEO data available. Run a scan first."
    loading-message="Loading SEO data..."
  >
    <template v-if="report">
      <!-- Indexability summary cards — SEO-specific. -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <UiStat card title="Indexability" :value="report.indexabilityPercent" suffix="%" :value-class="report.indexabilityPercent === 100 ? 'text-success' : report.indexabilityPercent >= 80 ? 'text-warning' : 'text-error'" />
        <UiStat card title="Indexable Routes" :value="report.indexableRoutes" value-class="text-success" />
        <UiStat card title="Unindexable Routes" :value="report.unindexableRoutes" :value-class="report.unindexableRoutes > 0 ? 'text-error' : 'text-success'" />
        <UiStat card title="Routes Analysed" :value="report.routesAnalysed" />
      </div>

      <!-- Findings via the shared accordion. -->
      <PackFindings :findings="report.findings" title="SEO Issues" />

      <!-- Per-route checks table (SEO-specific again). -->
      <UiCard v-if="report.routeChecks.length" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">
            Route Checks
          </h3>
        </template>
        <UiTable :columns="routeCheckColumns" :data="report.routeChecks" disable-pagination />
      </UiCard>

      <div v-if="!report.findings.length && !report.routeChecks.length" class="text-center py-12 text-muted">
        No SEO issues found.
      </div>
    </template>
  </CategoryPageShell>
</template>
