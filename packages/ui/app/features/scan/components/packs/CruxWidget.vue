<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { CruxFinding, CruxReport, GapEntry } from '@unlighthouse/contracts/packs'
import { h } from 'vue'
import { cwvColor } from '~/features/scan/routes-table'
// See CwvWidget.vue for why `report` arrives untyped and gets cast here.
// This replaces the pre-pivot crux.vue page, which cast `pack.run`'s report
// through a stale, unrelated `CruxData` type (`packages/contracts/types/dashboard.ts`,
// now deleted) that never matched what the `crux` pack actually returns
// (`CruxReportSchema`). This widget renders the real shape.
const props = defineProps<{ report: unknown, scanBase?: string }>()

const { fmtMs } = createFormatters()

const report = computed(() => props.report as CruxReport)

const GAP_CAP = 20

const ratingDistribution = computed(() => [
  { label: 'Good', count: report.value.severityCounts.good, status: 'success' as const },
  { label: 'Needs improvement', count: report.value.severityCounts.needsImprovement, status: 'warning' as const },
  { label: 'Poor', count: report.value.severityCounts.poor, status: 'error' as const },
])

function fmtCls(value: number | null): string {
  return formatMetricValue(value, '')
}

function severityToStatus(severity: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (severity) {
    case 'good': return 'success'
    case 'needsImprovement': return 'warning'
    case 'poor': return 'error'
    default: return 'neutral'
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'url': return 'URL'
    case 'origin': return 'Origin fallback'
    default: return 'No data'
  }
}

const UiStatusBadgeC = resolveComponent('UiStatusBadge')
const UiTooltipC = resolveComponent('UiTooltip')

const findingColumns: ColumnDef<CruxFinding>[] = [
  {
    accessorKey: 'severity',
    // A CWV good/needsImprovement/poor band, not a finding severity —
    // "Rating" avoids conflating it with the critical/serious/moderate/minor
    // vocabulary the other packs' findings use (see DESIGN.md severity rules).
    header: 'Rating',
    headClass: 'w-8',
    cell: ({ row }) => h(UiStatusBadgeC, { status: severityToStatus(row.original.severity) }),
  },
  {
    accessorKey: 'url',
    header: 'URL',
    cell: ({ row }) => h(UiTooltipC, { text: row.original.url, side: 'top', size: 'lg' }, {
      default: () => h('span', { class: 'font-mono text-xs truncate block max-w-sm' }, row.original.url),
    }),
  },
  {
    accessorKey: 'formFactor',
    header: 'Form Factor',
    headClass: 'w-28',
    cell: ({ row }) => h('span', { class: 'text-xs text-muted' }, row.original.formFactor),
  },
  {
    accessorKey: 'lcp_p75',
    header: 'LCP p75',
    align: 'right',
    headClass: 'w-24',
    cell: ({ row }) => h('span', { class: `tabular-nums text-xs ${cwvColor('lcp', row.original.lcp_p75)}` }, fmtMs(row.original.lcp_p75)),
  },
  {
    accessorKey: 'cls_p75',
    header: 'CLS p75',
    align: 'right',
    headClass: 'w-24',
    cell: ({ row }) => h('span', { class: `tabular-nums text-xs ${cwvColor('cls', row.original.cls_p75)}` }, fmtCls(row.original.cls_p75)),
  },
  {
    accessorKey: 'inp_p75',
    header: 'INP p75',
    align: 'right',
    headClass: 'w-24',
    cell: ({ row }) => h('span', { class: `tabular-nums text-xs ${cwvColor('inp', row.original.inp_p75)}` }, fmtMs(row.original.inp_p75)),
  },
  {
    accessorKey: 'source',
    header: 'Source',
    headClass: 'w-32',
    cell: ({ row }) => h('span', { class: 'text-xs text-muted' }, sourceLabel(row.original.source)),
  },
]

function gapValue(metric: GapEntry['metric'], value: number | null): string {
  return metric === 'cls' ? fmtCls(value) : fmtMs(value)
}

const gapSections = computed(() => [
  {
    key: 'goodLabPoorField',
    title: 'Lab passed, field disagrees',
    description: 'Lighthouse scored these good in the lab; real-user CrUX data says poor. Trust the field data — these are live regressions the lab run missed.',
    status: 'error' as const,
    entries: report.value.gapAnalysis.goodLabPoorField,
  },
  {
    key: 'poorLabGoodField',
    title: 'Lab failed, field passes',
    description: 'Lighthouse flagged these poor in the lab; CrUX field data says good. Likely single-run noise or an overly strict lab condition — deprioritize unless field data goes stale.',
    status: 'warning' as const,
    entries: report.value.gapAnalysis.poorLabGoodField,
  },
  {
    key: 'aligned',
    title: 'Lab and field agree',
    description: 'Both lab and field data agree on the verdict. High-confidence findings — fix these first.',
    status: 'neutral' as const,
    entries: report.value.gapAnalysis.aligned,
  },
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Field Data (CrUX)
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes`">
        View routes
      </UiButton>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UiStat card title="Good" :value="report.severityCounts.good" value-class="text-success" />
      <UiStat card title="Needs Improvement" :value="report.severityCounts.needsImprovement" value-class="text-warning" />
      <UiStat card title="Poor" :value="report.severityCounts.poor" value-class="text-error" />
      <UiStat card title="Unknown" :value="report.severityCounts.unknown" />
    </div>

    <UiCard v-if="report.findings.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">
          Field rating distribution
        </h3>
      </template>
      <DistributionBar :segments="ratingDistribution" />
    </UiCard>

    <p v-if="report.hasOriginFallback" class="text-xs text-muted">
      Some routes lacked enough URL-level traffic for a CrUX record and fell back to origin-level field data.
    </p>

    <UiCard v-if="report.findings.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed flex items-center gap-2">
          Field Data by Route
          <UiChip purpose="count">
            {{ report.findings.length }}
          </UiChip>
        </h3>
      </template>
      <UiTable :columns="findingColumns" :data="report.findings" :page-size="20" />
    </UiCard>
    <UiEmptyState
      v-else
      icon="globe"
      title="0 CrUX field records for this site"
      description="Field data requires the site to have enough traffic in the Chrome User Experience Report."
      compact
    />

    <div v-if="report.findings.length" class="grid gap-4 lg:grid-cols-3">
      <UiCard v-for="section in gapSections" :key="section.key" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed flex items-center gap-2">
            <UiChip purpose="status" :status="section.status">
              {{ section.entries.length }}
            </UiChip>
            {{ section.title }}
          </h3>
        </template>
        <p class="text-xs text-muted mb-3">
          {{ section.description }}
        </p>
        <div v-if="section.entries.length" class="space-y-1.5">
          <div v-for="g in section.entries.slice(0, GAP_CAP)" :key="`${g.url}-${g.formFactor}-${g.metric}`" class="text-xs">
            <UiTooltip :text="g.url" side="top" size="lg">
              <div class="font-mono truncate">
                {{ g.url }}
              </div>
            </UiTooltip>
            <div class="flex items-center justify-between text-muted mt-0.5">
              <span class="uppercase">{{ g.metric }}</span>
              <span class="tabular-nums">{{ gapValue(g.metric, g.labValue) }} lab · {{ gapValue(g.metric, g.fieldValue) }} field</span>
            </div>
          </div>
          <div v-if="section.entries.length > GAP_CAP" class="text-xs text-dimmed pt-1">
            +{{ section.entries.length - GAP_CAP }} more
          </div>
        </div>
        <p v-else class="text-xs text-dimmed">
          None.
        </p>
      </UiCard>
    </div>
  </div>
</template>
