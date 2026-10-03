<script setup lang="ts">
import type { OverviewReport } from '@unlighthouse/contracts/packs'
import type { UiTableColumn } from '#layers/design-system/app/utils/ui-table'
import { computed, h } from 'vue'
import { NuxtLink, UiTooltip } from '#components'
import { formatNumber } from '#layers/design-system/app/composables/formatting'
import { createScoreColorHelpers } from '~/composables/useScoreColor'
import { overviewRoutePath } from '~/features/scan/overview-diagnostics'
import { scanRouteLink } from '~/features/scan/route-links'

const props = defineProps<{
  summary?: OverviewReport
  scanBase: string
  device?: 'mobile' | 'desktop'
  loading: boolean
}>()

const { scoreToColor, scoreToLabel } = createScoreColorHelpers()
type WorstRoute = OverviewReport['worstRoutes'][number]
type TemplateGroup = OverviewReport['templateGroups'][number]
const routes = computed(() => props.summary?.worstRoutes ?? [])
const groups = computed(() => props.summary?.templateGroups ?? [])

const routeColumns: UiTableColumn<WorstRoute>[] = [
  {
    accessorKey: 'url',
    header: 'Route',
    meta: { cellClass: 'max-w-40' },
    cell: ({ row }) => {
      const entry = row.original
      const path = overviewRoutePath(entry.url)
      const device = entry.device ?? props.device
      return h(UiTooltip, { text: entry.url, triggerAs: 'child' }, {
        default: () => h(NuxtLink, {
          'to': scanRouteLink(props.scanBase, path, device, entry.url),
          'aria-label': `View report for ${entry.url}${device ? ` (${device})` : ''}`,
          'class': 'flex min-h-11 min-w-0 items-center rounded-md font-mono text-sm text-highlighted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        }, { default: () => h('span', { class: 'truncate' }, path) }),
      })
    },
  },
  {
    accessorKey: 'device',
    header: 'Device',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.device ?? props.device ?? 'Unknown device'),
  },
  {
    accessorKey: 'score',
    header: 'Overall score',
    meta: { align: 'right' },
    cell: ({ row }) => h('span', { class: `text-sm tabular-nums font-semibold ${scoreToColor(row.original.score)}` }, scoreToLabel(row.original.score)),
  },
]

const groupColumns: UiTableColumn<TemplateGroup>[] = [
  {
    accessorKey: 'routeName',
    header: 'Template',
    meta: { cellClass: 'max-w-40' },
    cell: ({ row }) => h(UiTooltip, { text: row.original.routeName ?? 'Unmatched routes' }, {
      default: () => h('span', { class: 'block truncate font-mono text-sm' }, row.original.routeName ?? 'Unmatched routes'),
    }),
  },
  {
    accessorKey: 'routes',
    header: 'URL/device entries',
    meta: { align: 'right' },
    cell: ({ row }) => h('span', { class: 'text-sm tabular-nums' }, formatNumber(row.original.routes)),
  },
  {
    accessorKey: 'avgScore',
    header: 'Overall score',
    meta: { align: 'right' },
    cell: ({ row }) => h('span', { class: `text-sm tabular-nums font-semibold ${scoreToColor(row.original.avgScore)}` }, scoreToLabel(row.original.avgScore)),
  },
]
</script>

<template>
  <section class="min-w-0 space-y-4" aria-label="Scan rankings">
    <p class="text-sm text-muted">
      Overall score averages Performance, Accessibility, SEO, and Best Practices when scores exist.
    </p>
    <div class="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
      <UiCard class="min-w-0 max-w-full" title="Lowest overall scores" description="Up to 5 audited URL/device entries, ranked by overall score.">
        <UiLoadingState v-if="!summary" :rows="3" />
        <template v-else>
          <p v-if="loading" role="status" class="mb-3 text-sm text-muted">
            Loading results...
          </p>
          <UiTable v-if="routes.length" :columns="routeColumns" :data="routes" :row-id="row => `${row.url}:${row.device}`" label="Lowest overall scores" disable-pagination class="min-w-0 max-w-full overflow-x-auto! rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" tabindex="0" role="region" aria-label="Lowest overall scores" />
          <p v-else class="py-6 text-sm text-muted">
            No scored routes in this view.
          </p>
        </template>
      </UiCard>
      <UiCard class="min-w-0 max-w-full" title="Template groups" description="Up to 5 groups, ranked by average overall score.">
        <UiLoadingState v-if="!summary" :rows="3" />
        <template v-else>
          <p v-if="loading" role="status" class="mb-3 text-sm text-muted">
            Loading results...
          </p>
          <UiTable v-if="groups.length" :columns="groupColumns" :data="groups" :row-id="row => row.routeName ?? 'unmatched'" label="Template groups" disable-pagination class="min-w-0 max-w-full overflow-x-auto! rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" tabindex="0" role="region" aria-label="Template groups" />
          <p v-else class="py-6 text-sm text-muted">
            No template groups in this view.
          </p>
        </template>
      </UiCard>
    </div>
  </section>
</template>
