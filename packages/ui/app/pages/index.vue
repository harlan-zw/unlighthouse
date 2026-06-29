<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'
import type { DashboardSiteRow } from '~/features/dashboard/overview'
import { useDashboardOverview } from '~/features/dashboard/overview'
import ScanStatusBadge from '~/features/scan/components/ScanStatusBadge.vue'
import Sparkline from '~/features/sites/components/Sparkline.vue'
import type { ScanRow } from '~/features/sites/scan-pairs'

definePageMeta({ layout: 'root', middleware: 'onboarding' })

const { scoreToColor, scoreToLabel } = useScoreColor()
const { fmtRelTime } = useFormat()

const FaviconC = resolveComponent('Favicon')
const {
  historyStatus,
  allScans,
  siteRows,
  kpis,
  recentScans,
  isEmpty,
  activeScan,
  openActiveScan,
  openSite,
  openScan,
} = useDashboardOverview()

function score100Color(v: number | null): string {
  if (v == null) return 'var(--muted-foreground)'
  return v >= 90 ? '#22c55e' : v >= 50 ? '#f97316' : '#ef4444'
}

// ── Sites table ──────────────────────────────────────────────────────────────
const CAT_COLS: { key: string, label: string }[] = [
  { key: 'performance', label: 'Perf' },
  { key: 'accessibility', label: 'A11y' },
  { key: 'seo', label: 'SEO' },
  { key: 'best-practices', label: 'BP' },
]
const siteColumns: ColumnDef<DashboardSiteRow>[] = [
  {
    accessorKey: 'name',
    header: 'Site',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2.5 min-w-0' }, [
      h(FaviconC, { domain: row.original.slug, size: 24, alt: `${row.original.name} favicon` }),
      h('div', { class: 'min-w-0' }, [
        h('div', { class: 'text-sm font-medium truncate' }, row.original.name),
        h('div', { class: 'text-[11px] text-muted font-mono truncate' }, row.original.url),
      ]),
    ]),
  },
  {
    id: 'avg',
    accessorFn: (r: DashboardSiteRow) => r.avg ?? undefined,
    header: 'Score',
    sortUndefined: 'last',
    align: 'center',
    cell: ({ row }) => h('span', { class: `text-sm font-bold tabular-nums ${scoreToColor(row.original.avg)}` }, scoreToLabel(row.original.avg)),
  },
  ...CAT_COLS.map(c => ({
    id: c.key,
    accessorFn: (r: DashboardSiteRow) => r.cats[c.key] ?? undefined,
    header: c.label,
    sortUndefined: 'last' as const,
    align: 'center' as const,
    cell: ({ row }: any) => {
      const v = row.original.cats[c.key] as number | undefined
      return h('span', { class: `text-xs font-semibold tabular-nums ${scoreToColor(v ?? null)}` }, scoreToLabel(v ?? null))
    },
  })),
  {
    id: 'trend',
    header: 'Trend',
    enableSorting: false,
    align: 'left',
    cell: ({ row }) => h(Sparkline, { values: row.original.series, color: score100Color(row.original.avg != null ? row.original.avg * 100 : null) }),
  },
  {
    id: 'last',
    accessorFn: (r: DashboardSiteRow) => r.lastAt ?? '',
    header: 'Last scan',
    align: 'right',
    cell: ({ row }) => h('span', { class: 'text-xs text-muted tabular-nums' }, row.original.lastAt ? fmtRelTime(row.original.lastAt) : '—'),
  },
]

// ── Recent scans table ───────────────────────────────────────────────────────
const recentColumns: ColumnDef<ScanRow>[] = [
  {
    accessorKey: 'site',
    header: 'Site',
    enableSorting: false,
    cell: ({ row }) => h('span', { class: 'text-sm font-mono truncate block max-w-xs' }, (() => {
      try {
        return new URL(row.original.site).hostname + new URL(row.original.site).pathname.replace(/\/$/, '')
      }
      catch {
        return row.original.site
      }
    })()),
  },
  {
    id: 'device',
    header: 'Device',
    enableSorting: false,
    align: 'center',
    cell: ({ row }) => h(resolveComponent('Icon'), { name: row.original.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor', class: 'size-3.5 text-muted' }),
  },
  {
    id: 'avg',
    header: 'Score',
    enableSorting: false,
    align: 'center',
    cell: ({ row }) => h('span', { class: `text-sm font-bold tabular-nums ${scoreToColor(row.original.summary?.scoreAverage ?? null)}` }, scoreToLabel(row.original.summary?.scoreAverage ?? null)),
  },
  {
    id: 'routes',
    header: 'Routes',
    enableSorting: false,
    align: 'right',
    cell: ({ row }) => h('span', { class: 'text-xs tabular-nums text-muted' }, String(row.original.summary?.completed ?? 0)),
  },
  {
    id: 'status',
    header: 'Status',
    enableSorting: false,
    align: 'center',
    cell: ({ row }) => h(ScanStatusBadge, { status: row.original.status }),
  },
  {
    id: 'when',
    header: 'When',
    enableSorting: false,
    align: 'right',
    cell: ({ row }) => h('span', { class: 'text-xs text-muted tabular-nums' }, fmtRelTime(row.original.startedAt)),
  },
]
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Dashboard" description="Your sites at a glance." flush>
      <template #actions>
        <UiButton purpose="cta" to="/scan/new" icon="i-lucide-plus">New Scan</UiButton>
      </template>
    </PageHeader>

    <!-- Active scan banner -->
    <div v-if="activeScan.isActive" class="rounded-xl border border-primary/50 bg-primary/5 cursor-pointer p-4" @click="openActiveScan">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="relative flex size-2">
              <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span class="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span class="text-sm font-medium">Scanning {{ activeScan.site }}</span>
          </div>
          <span class="text-sm tabular-nums text-muted">{{ activeScan.scanned }}/{{ activeScan.total }}</span>
        </div>
        <UProgress :model-value="activeScan.percent" size="sm" />
    </div>

    <!-- Empty state -->
    <div v-if="isEmpty" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="size-16 rounded-full bg-elevated flex items-center justify-center mb-6">
        <Icon name="lucide:radar" class="size-8 text-muted" />
      </div>
      <h2 class="text-heading mb-2">No scans yet</h2>
      <p class="text-muted mb-6 max-w-sm">
        Start your first scan to get SEO, performance, and accessibility insights for your website.
      </p>
      <UiButton purpose="cta" size="lg" to="/scan/new" icon="i-lucide-plus">Start First Scan</UiButton>
    </div>

    <template v-else>
      <!-- KPI cards -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <UiStat card title="Sites" :value="kpis.sites" />
        <UiStat card title="Total scans" :value="kpis.scans" />
        <UiStat card title="Avg score" :value="kpis.avg" :value-class="kpis.avg != null ? scoreToColor(kpis.avg / 100) : ''" />
        <UiStat card title="Needs attention" :value="kpis.needs" :value-class="kpis.needs ? 'text-warning' : ''" />
      </div>

      <!-- Sites -->
      <div v-if="siteRows.length" class="space-y-3">
        <SectionHeader title="Sites">
          <template #actions>
            <NuxtLink to="/sites" class="text-xs text-dimmed hover:text-default transition-colors">
              Manage <Icon name="lucide:arrow-right" class="size-3 inline" />
            </NuxtLink>
          </template>
        </SectionHeader>
        <UiTable :columns="siteColumns" :data="siteRows" enable-sorting row-clickable row-hover @row-click="openSite" />
      </div>

      <!-- Recent scans -->
      <div v-if="recentScans.length" class="space-y-3">
        <SectionHeader title="Recent scans">
          <template #actions>
            <NuxtLink to="/history" class="text-xs text-dimmed hover:text-default transition-colors">
              View all <Icon name="lucide:arrow-right" class="size-3 inline" />
            </NuxtLink>
          </template>
        </SectionHeader>
        <UiTable :columns="recentColumns" :data="recentScans" row-clickable row-hover @row-click="openScan" />
      </div>
    </template>
  </div>
</template>
