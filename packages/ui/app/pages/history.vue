<script setup lang="ts">
import type { ScanId } from '@unlighthouse/contracts'
import { toast } from 'vue-sonner'
import SiteHistoryTable from '~/features/sites/components/SiteHistoryTable.vue'
import { scanLinkPath } from '~/features/scan/scan-links'
import { pairScans, type DevicePair, type ScanRow } from '~/features/sites/scan-pairs'

definePageMeta({ layout: 'root' })

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

const groups = computed<SiteGroup[]>(() => {
  const items = (scansResp.value?.items ?? []) as ScanRow[]
  if (!items.length) return []

  // Group by domain (origin) so every path scanned on a host lands in one
  // list — not a separate group per exact URL.
  const buckets = new Map<string, ScanRow[]>()
  for (const s of items) {
    let key: string
    try {
      key = new URL(s.site).origin
    }
    catch {
      key = s.site
    }
    const arr = buckets.get(key) ?? []
    arr.push(s)
    buckets.set(key, arr)
  }

  const out: SiteGroup[] = []
  for (const [site, group] of buckets) {
    // Pairing (mobile+desktop within ~5 min) is shared with the per-site page.
    const pairs = pairScans(group)
    const latestStartedAt = group.reduce((acc, s) => (s.startedAt > acc ? s.startedAt : acc), '')
    out.push({ site, scanCount: group.length, latestStartedAt, pairs })
  }

  out.sort((a, b) => b.latestStartedAt.localeCompare(a.latestStartedAt))
  return out
})

// Search query filters the visible site groups client-side. Server-side
// pagination already pulled up to 200 scans; filtering locally avoids a
// round-trip per keystroke and keeps Collapsible expansion state stable.
const searchQuery = ref('')

const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return groups.value
  return groups.value.filter((g) => {
    if (g.site.toLowerCase().includes(q)) return true
    if (siteHostname(g.site).toLowerCase().includes(q)) return true
    // Also match scanId / ciCommit so users can paste a build hash and find
    // its scan without remembering which site it ran against.
    return g.pairs.some(p =>
      p.mobile?.scanId.toLowerCase().includes(q)
      || p.desktop?.scanId.toLowerCase().includes(q)
      || p.mobile?.ciCommit?.toLowerCase().includes(q)
      || p.desktop?.ciCommit?.toLowerCase().includes(q),
    )
  })
})

const totalScans = computed(() => scansResp.value?.items?.length ?? 0)
const filteredScanCount = computed(() => filteredGroups.value.reduce((sum, g) => sum + g.scanCount, 0))

// Expand the most-recent site by default; preserve user toggles per-site.
const expanded = reactive<Record<string, boolean>>({})
watch(groups, (gs) => {
  for (const g of gs) {
    if (expanded[g.site] === undefined)
      expanded[g.site] = g.site === gs[0]?.site
  }
}, { immediate: true })

const { fmtRelTime: relTime } = useFormat()

function siteHostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
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
    <PageHeader
      title="History"
      :description="searchQuery
        ? `${filteredScanCount} of ${totalScans} scan${totalScans === 1 ? '' : 's'} match`
        : `${totalScans} scan${totalScans === 1 ? '' : 's'} across ${groups.length} site${groups.length === 1 ? '' : 's'}`"
      flush
    >
      <template #actions>
        <UiButton purpose="cta" to="/scan/new" icon="i-lucide-plus">New Scan</UiButton>
      </template>
    </PageHeader>

    <!-- Search bar — site URL, hostname, scanId, or CI commit hash all match. -->
    <UInput
      v-if="groups.length"
      v-model="searchQuery"
      icon="i-lucide-search"
      placeholder="Filter by site, scanId, or commit..."
      class="max-w-md w-full"
    >
      <template v-if="searchQuery" #trailing>
        <UButton color="neutral" variant="link" size="sm" icon="i-lucide-x" aria-label="Clear search" @click="searchQuery = ''" />
      </template>
    </UInput>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-32 w-full" />
    </div>

    <div v-else-if="!groups.length" class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 flex flex-col items-center justify-center py-16 text-center">
      <Icon name="lucide:history" class="size-12 text-muted/50 mb-4" />
      <p class="text-muted">
        No scan history yet.
      </p>
    </div>

    <div v-else-if="!filteredGroups.length" class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 flex flex-col items-center justify-center py-12 text-center">
      <Icon name="lucide:search-x" class="size-10 text-muted/50 mb-3" />
      <p class="text-sm text-muted">
        No scans match "{{ searchQuery }}".
      </p>
    </div>

    <div
      v-for="group in filteredGroups"
      v-else
      :key="group.site"
      class="rounded-xl border border-default bg-default overflow-hidden"
    >
      <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated/40 transition-colors"
        @click="expanded[group.site] = !expanded[group.site]"
      >
        <Icon
          name="lucide:chevron-right"
          class="size-4 text-muted transition-transform shrink-0"
          :class="{ 'rotate-90': expanded[group.site] }"
        />
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">
            {{ siteHostname(group.site) }}
          </div>
          <div class="text-xs text-muted font-mono truncate">
            {{ group.site }}
          </div>
        </div>
        <UBadge color="neutral" variant="soft" size="xs" class="tabular-nums shrink-0">
          {{ group.scanCount }} scans
        </UBadge>
        <span class="text-xs text-muted tabular-nums shrink-0">
          latest {{ relTime(group.latestStartedAt) }}
        </span>
      </button>

      <div v-show="expanded[group.site]" class="border-t border-default">
        <SiteHistoryTable
          :pairs="group.pairs"
          @rescan="rescanFromHistory"
          @delete="deleteScan"
          @open="(pair) => router.push(scanLinkPath(siteSlug((pair.mobile ?? pair.desktop)?.site ?? ''), primaryScanId(pair), (pair.mobile ?? pair.desktop)?.status))"
        />
      </div>
    </div>
  </div>
</template>
