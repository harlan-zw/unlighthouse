<script setup lang="ts">
import type { ScanId } from '@unlighthouse/contracts'
import type { DevicePair, ScanRow } from '@/components/site/types'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'

interface SiteGroup {
  site: string
  scanCount: number
  latestStartedAt: string
  pairs: DevicePair[]
}

const router = useRouter()
const api = useApi()

const { data: scansResp, status, refresh } = useAsyncData(
  'scan-history-grouped',
  () => api['history.list']({ page: 1, pageSize: 200 }).catch(() => null),
)

/** Mobile + desktop scans of the same site started within 5 min of each
 *  other are treated as one matrix scan and merged onto a single row. */
const PAIR_WINDOW_MS = 5 * 60_000

const groups = computed<SiteGroup[]>(() => {
  const items = (scansResp.value?.items ?? []) as ScanRow[]
  if (!items.length) return []

  const buckets = new Map<string, ScanRow[]>()
  for (const s of items) {
    const arr = buckets.get(s.site) ?? []
    arr.push(s)
    buckets.set(s.site, arr)
  }

  const out: SiteGroup[] = []
  for (const [site, group] of buckets) {
    const sorted = [...group].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const used = new Set<string>()
    const pairs: DevicePair[] = []

    for (const scan of sorted) {
      if (used.has(scan.scanId)) continue
      used.add(scan.scanId)

      const otherDevice = scan.device === 'mobile' ? 'desktop' : 'mobile'
      const tsScan = new Date(scan.startedAt).getTime()
      const sibling = sorted.find((s) => {
        if (used.has(s.scanId)) return false
        if (s.device !== otherDevice) return false
        return Math.abs(new Date(s.startedAt).getTime() - tsScan) <= PAIR_WINDOW_MS
      })
      if (sibling) used.add(sibling.scanId)

      pairs.push({
        startedAt: scan.startedAt > (sibling?.startedAt ?? '') ? scan.startedAt : (sibling?.startedAt ?? scan.startedAt),
        routes: Math.max(scan.summary?.routes ?? 0, sibling?.summary?.routes ?? 0),
        completed: Math.max(scan.summary?.completed ?? 0, sibling?.summary?.completed ?? 0),
        mobile: scan.device === 'mobile' ? scan : (sibling?.device === 'mobile' ? sibling : null),
        desktop: scan.device === 'desktop' ? scan : (sibling?.device === 'desktop' ? sibling : null),
      })
    }

    out.push({
      site,
      scanCount: group.length,
      latestStartedAt: sorted[0]!.startedAt,
      pairs,
    })
  }

  out.sort((a, b) => b.latestStartedAt.localeCompare(a.latestStartedAt))
  return out
})

const totalScans = computed(() => scansResp.value?.items?.length ?? 0)

// Expand the most-recent site by default; preserve user toggles per-site.
const expanded = reactive<Record<string, boolean>>({})
watch(groups, (gs) => {
  for (const g of gs) {
    if (expanded[g.site] === undefined)
      expanded[g.site] = g.site === gs[0]?.site
  }
}, { immediate: true })

function siteHostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
function primaryScanId(pair: DevicePair) {
  return pair.mobile?.scanId ?? pair.desktop?.scanId ?? ''
}

async function rescanFromHistory(scanId: string) {
  if (!scanId) return
  try {
    const result = await api['history.rescan']({ scanId: scanId as ScanId })
    toast.success('Rescan started')
    router.push(`/scan/${result.scanId}/overview`)
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err.message })
  }
}
async function deleteScan(scanId: string) {
  if (!scanId) return
  try {
    await api['scan.delete']({ scanId: scanId as ScanId })
    toast.success('Scan deleted')
    refresh()
  }
  catch (err: any) {
    toast.error('Failed to delete', { description: err.message })
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          History
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ totalScans }} scan{{ totalScans === 1 ? '' : 's' }} across {{ groups.length }} site{{ groups.length === 1 ? '' : 's' }}
        </p>
      </div>
      <Button as-child>
        <NuxtLink to="/scan/new">
          <Icon name="lucide:plus" class="size-4 mr-2" />
          New Scan
        </NuxtLink>
      </Button>
    </div>

    <div v-if="status === 'pending'" class="space-y-3">
      <Skeleton v-for="i in 3" :key="i" class="h-32 w-full" />
    </div>

    <Card v-else-if="!groups.length">
      <CardContent class="flex flex-col items-center justify-center py-16 text-center">
        <Icon name="lucide:history" class="size-12 text-muted-foreground/50 mb-4" />
        <p class="text-muted-foreground">
          No scan history yet.
        </p>
      </CardContent>
    </Card>

    <Collapsible
      v-for="group in groups"
      v-else
      :key="group.site"
      v-model:open="expanded[group.site]"
      class="rounded-md border bg-card overflow-hidden"
    >
      <CollapsibleTrigger class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
        <Icon
          name="lucide:chevron-right"
          class="size-4 text-muted-foreground transition-transform shrink-0"
          :class="{ 'rotate-90': expanded[group.site] }"
        />
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">
            {{ siteHostname(group.site) }}
          </div>
          <div class="text-xs text-muted-foreground font-mono truncate">
            {{ group.site }}
          </div>
        </div>
        <Badge variant="secondary" class="text-[10px] tabular-nums shrink-0">
          {{ group.scanCount }} scans
        </Badge>
        <span class="text-xs text-muted-foreground tabular-nums shrink-0">
          latest {{ relTime(group.latestStartedAt) }}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent class="border-t">
        <SiteHistoryTable
          :pairs="group.pairs"
          @rescan="rescanFromHistory"
          @delete="deleteScan"
          @open="(pair) => router.push(`/scan/${primaryScanId(pair)}/overview`)"
        />
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
