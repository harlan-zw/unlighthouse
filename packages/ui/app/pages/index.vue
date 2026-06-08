<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { ScanRow } from '@/components/site/types'
import { h } from 'vue'
import { useScanStore } from '~/stores/scan'

definePageMeta({ layout: 'root', middleware: 'onboarding' })

const api = useApi()
const router = useRouter()
const store = useScanStore()
const { scoreToColor, scoreToLabel } = useScoreColor()
const { fmtRelTime } = useFormat()

const ScanStatusBadge = resolveComponent('ScanStatusBadge')
const SparklineC = resolveComponent('Sparkline')

const { data: histResp, status: historyStatus } = useAsyncData(
  'recent-scans',
  () => api['history.list']({ page: 1, pageSize: 200 }).catch(() => null),
)
const { data: sitesData } = useAsyncData(
  'dashboard-sites',
  () => api['sites.list']({}).catch(() => ({ sites: [] as Array<{ id: string, name: string, url: string, group: string | null }> })),
)

const allScans = computed(() => (histResp.value?.items ?? []) as ScanRow[])
const totalScans = computed(() => histResp.value?.total ?? 0)

function originOf(u: string): string {
  try {
    return new URL(u).origin
  }
  catch {
    return u
  }
}

// Scans grouped by site origin (newest first).
const byOrigin = computed(() => {
  const m = new Map<string, ScanRow[]>()
  for (const s of allScans.value) {
    const o = originOf(s.site)
    const arr = m.get(o) ?? []
    arr.push(s)
    m.set(o, arr)
  }
  for (const arr of m.values())
    arr.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return m
})

interface SiteRow {
  name: string
  slug: string
  url: string
  avg: number | null
  cats: Record<string, number | undefined>
  series: number[]
  lastAt: string | null
  scanCount: number
}

const siteRows = computed<SiteRow[]>(() =>
  (sitesData.value?.sites ?? []).map((site) => {
    const scans = (byOrigin.value.get(originOf(site.url)) ?? []).filter(s => s.summary && (s.summary.completed ?? 0) > 0)
    const latest = scans[0] ?? null
    const series = [...scans].reverse().slice(-12).map(s => Math.round((s.summary?.scoreAverage ?? 0) * 100))
    return {
      name: site.name || siteSlug(site.url),
      slug: siteSlug(site.url),
      url: site.url,
      avg: latest?.summary?.scoreAverage ?? null,
      cats: (latest?.summary?.scoresByCategory ?? {}) as Record<string, number | undefined>,
      series,
      lastAt: latest?.startedAt ?? null,
      scanCount: scans.length,
    }
  }),
)

const kpis = computed(() => {
  const avgs = siteRows.value.map(r => r.avg).filter((v): v is number => v != null)
  return {
    sites: siteRows.value.length,
    scans: totalScans.value,
    avg: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) : null,
    needs: siteRows.value.filter(r => r.avg != null && r.avg < 0.9).length,
  }
})
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
const siteColumns: ColumnDef<SiteRow>[] = [
  {
    accessorKey: 'name',
    header: 'Site',
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('div', { class: 'text-sm font-medium truncate' }, row.original.name),
      h('div', { class: 'text-[11px] text-muted-foreground font-mono truncate' }, row.original.url),
    ]),
  },
  {
    id: 'avg',
    accessorFn: (r: SiteRow) => r.avg ?? undefined,
    header: 'Score',
    sortUndefined: 'last',
    align: 'center',
    cell: ({ row }) => h('span', { class: `text-sm font-bold tabular-nums ${scoreToColor(row.original.avg)}` }, scoreToLabel(row.original.avg)),
  },
  ...CAT_COLS.map(c => ({
    id: c.key,
    accessorFn: (r: SiteRow) => r.cats[c.key] ?? undefined,
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
    cell: ({ row }) => h(SparklineC, { values: row.original.series, color: score100Color(row.original.avg != null ? row.original.avg * 100 : null) }),
  },
  {
    id: 'last',
    accessorFn: (r: SiteRow) => r.lastAt ?? '',
    header: 'Last scan',
    align: 'right',
    cell: ({ row }) => h('span', { class: 'text-xs text-muted-foreground tabular-nums' }, row.original.lastAt ? fmtRelTime(row.original.lastAt) : '—'),
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
    cell: ({ row }) => h(resolveComponent('Icon'), { name: row.original.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor', class: 'size-3.5 text-muted-foreground' }),
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
    cell: ({ row }) => h('span', { class: 'text-xs tabular-nums text-muted-foreground' }, String(row.original.summary?.completed ?? 0)),
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
    cell: ({ row }) => h('span', { class: 'text-xs text-muted-foreground tabular-nums' }, fmtRelTime(row.original.startedAt)),
  },
]
const recentScans = computed(() => allScans.value.slice(0, 10))

function openSite(r: SiteRow) {
  router.push(`/sites/${r.slug}`)
}
function openScan(s: ScanRow) {
  router.push(`/sites/${siteSlug(s.site)}/scans/${s.scanId}/routes`)
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Dashboard" description="Your sites at a glance." flush>
      <template #actions>
        <UiButton purpose="cta" to="/scan/new" icon="i-lucide-plus">New Scan</UiButton>
      </template>
    </PageHeader>

    <!-- Active scan banner -->
    <div v-if="store.isActive" class="rounded-xl border border-primary/50 bg-primary/5 cursor-pointer p-4" @click="router.push(`/sites/${siteSlug(store.site || '')}/scans/${store.scanId}/routes`)">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="relative flex size-2">
              <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span class="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span class="text-sm font-medium">Scanning {{ store.site }}</span>
          </div>
          <span class="text-sm tabular-nums text-muted-foreground">{{ store.scanned }}/{{ store.total }}</span>
        </div>
        <UProgress :model-value="store.percent" size="sm" />
    </div>

    <!-- Empty state -->
    <div v-if="historyStatus !== 'pending' && !allScans.length && !store.isActive" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="size-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon name="lucide:radar" class="size-8 text-muted-foreground" />
      </div>
      <h2 class="text-heading mb-2">No scans yet</h2>
      <p class="text-muted-foreground mb-6 max-w-sm">
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
