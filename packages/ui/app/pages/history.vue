<script setup lang="ts">
import type { ScanId } from '@unlighthouse/contracts'
import type { DevicePair, ScanRow } from '~/features/sites/scan-pairs'
import { toast } from 'vue-sonner'
import { scanLinkPath } from '~/features/scan/scan-links'
import SiteHistoryTable from '~/features/sites/components/SiteHistoryTable.vue'
import { pairScans } from '~/features/sites/scan-pairs'

definePageMeta({ layout: 'root' })
usePageTitle('Scan History')

interface SiteGroup {
  site: string
  scanCount: number
  latestStartedAt: string
  pairs: DevicePair[]
}

const router = useRouter()

const { data: scansResp, status, error: historyError, refresh } = useApiQuery(
  'history.list',
  () => ({ page: 1, pageSize: 200 }),
)

const rescanMutation = useApiMutation('history.rescan')
const deleteMutation = useApiMutation('scan.delete', { invalidates: ['history.list'] })

const groups = computed<SiteGroup[]>(() => {
  const items = (scansResp.value?.items ?? []) as ScanRow[]
  if (!items.length)
    return []

  // Group by domain (origin) so every path scanned on a host lands in one
  // list — not a separate group per exact URL.
  const buckets = new Map<string, ScanRow[]>()
  for (const s of items) {
    let key: string
    try {
      key = new URL(s.site).origin
    }
    catch (_err) {
      // Keep malformed site labels grouped under their raw value.
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
  if (!q)
    return groups.value
  return groups.value.filter((g) => {
    if (g.site.toLowerCase().includes(q))
      return true
    if (siteHostname(g.site).toLowerCase().includes(q))
      return true
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

const { fmtRelTime: relTime } = createFormatters()

const siteHostname = siteSlug
function primaryScanId(pair: DevicePair) {
  return pair.mobile?.scanId ?? pair.desktop?.scanId ?? ''
}

async function rescanFromHistory(scanId: string) {
  if (!scanId)
    return
  const result = await rescanMutation.mutateSafe({ scanId: scanId as ScanId })
  if (result._tag === 'err') {
    toast.error('Rescan failed', { description: normalizeApiError(result.error).message })
    return
  }
  toast.success('Rescan started')
  router.push(`/scan/${result.data.scanId}/overview`)
}
async function deleteScan(scanId: string) {
  if (!scanId)
    return
  const result = await deleteMutation.mutateSafe({ scanId: scanId as ScanId })
  if (result._tag === 'err') {
    toast.error('Failed to delete', { description: normalizeApiError(result.error).message })
    return
  }
  toast.success('Scan deleted')
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader
      title="History"
      :description="searchQuery
        ? `${filteredScanCount} of ${totalScans} scan${totalScans === 1 ? '' : 's'} match`
        : `${totalScans} scan${totalScans === 1 ? '' : 's'} across ${groups.length} site${groups.length === 1 ? '' : 's'}`"
      flush
    >
      <template #actions>
        <UiButton purpose="cta" to="/scan/new" icon="add">
          New Scan
        </UiButton>
      </template>
    </UiPageHeader>

    <!-- Search bar — site URL, hostname, scanId, or CI commit hash all match. -->
    <UInput
      v-if="groups.length"
      v-model="searchQuery"
      icon="search"
      placeholder="Filter by site, scanId, or commit..."
      class="max-w-md w-full"
    >
      <template v-if="searchQuery" #trailing>
        <UiButton purpose="quiet" size="xs" icon="close" aria-label="Clear search" @click="searchQuery = ''" />
      </template>
    </UInput>

    <QueryError v-if="historyError" :error="historyError" :on-retry="refresh" />

    <UiLoadingState v-else-if="status === 'pending'" :rows="3" />

    <UiEmptyState v-else-if="!groups.length" icon="history" title="No scan history yet." compact />

    <UiEmptyState
      v-else-if="!filteredGroups.length"
      icon="search-x"
      title="No scans match this filter."
      :description="searchQuery"
      compact
    />

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
        <UiIcon
          name="chevron-right"
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
        <UiChip purpose="count" tabular class="shrink-0">
          {{ group.scanCount }} scans
        </UiChip>
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
