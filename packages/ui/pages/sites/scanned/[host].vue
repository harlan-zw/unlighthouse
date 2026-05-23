<script setup lang="ts">
// Scan history view for a host that isn't in the curated `sites.*` registry.
// This is the fallback drill-in target for the `/sites` multi-site dashboard
// when a site was scanned via an override and has no matching registry entry.
//
// Thin wrapper around `history.list({ site })` filtered client-side by hostname
// (history.list takes the canonical URL; we resolve it from the first scan we
// see that matches the requested host).

import { siteHostname } from '~/composables/sites'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const host = computed(() => decodeURIComponent(String(route.params.host)))
const client = useApiClient()

const { data, pending } = await useAsyncData(
  () => `scanned-host:${host.value}`,
  async () => {
    // Pull all scans, then filter — we can't query by host directly, only by
    // exact URL. Once we have the canonical URL we could re-query, but the
    // dashboard already capped at 500 so re-using the data is fine.
    const all = await client['history.list']({ page: 1, pageSize: 500 })
    const items = (all.items ?? []).filter(s => siteHostname(s.site) === host.value)
    return items
  },
  { watch: [host] },
)

const scans = computed(() => data.value ?? [])
const canonicalUrl = computed(() => scans.value[0]?.site ?? `https://${host.value}`)

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function pct(s: number | null | undefined) {
  return s == null ? null : Math.round(s * 100)
}
</script>

<template>
  <div>
    <header class="mb-6 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <SiteFavicon :url="canonicalUrl" :alt="host" class="size-6" />
        <div class="min-w-0">
          <h1 class="text-xl font-semibold text-highlighted truncate">
            {{ host }}
          </h1>
          <a :href="canonicalUrl" target="_blank" class="text-xs text-muted font-mono hover:text-default transition-colors truncate block">
            {{ canonicalUrl }}
          </a>
        </div>
      </div>
      <NuxtLink to="/sites" class="text-xs text-muted hover:text-default transition-colors">
        ← All sites
      </NuxtLink>
    </header>

    <div v-if="pending" class="text-sm text-dimmed">
      Loading…
    </div>

    <div v-else-if="scans.length" class="rounded-sm ring-1 ring-default bg-elevated/40 overflow-hidden">
      <div class="px-4 py-3 border-b border-default flex items-center justify-between">
        <h2 class="font-medium text-highlighted">
          Scan history
        </h2>
        <p class="text-xs text-muted">
          {{ scans.length }} scan{{ scans.length === 1 ? '' : 's' }}
        </p>
      </div>
      <NuxtLink
        v-for="scan in scans"
        :key="scan.scanId"
        :to="`/results/${encodeURIComponent(scan.scanId)}`"
        class="flex items-center gap-4 px-4 py-3 hover:bg-elevated/60 transition-colors border-b border-default last:border-b-0"
      >
        <span class="text-sm text-muted w-44">{{ fmt(scan.startedAt) }}</span>
        <span class="text-xs text-dimmed capitalize w-16">{{ scan.device }}</span>
        <span class="text-xs text-dimmed">{{ scan.summary?.routes ?? 0 }} routes</span>
        <span
          class="text-[11px] px-1.5 py-0.5 rounded"
          :class="scan.status === 'complete' ? 'bg-success/10 text-success'
            : scan.status === 'error' || scan.status === 'cancelled' ? 'bg-error/10 text-error'
              : scan.status === 'scanning' || scan.status === 'starting' || scan.status === 'discovering' ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
        >
          {{ scan.status }}
        </span>
        <div class="ml-auto flex items-center gap-1.5">
          <TableScoreTile
            v-for="(score, key) in {
              P: pct(scan.summary?.scoresByCategory?.performance),
              A: pct(scan.summary?.scoresByCategory?.accessibility),
              B: pct(scan.summary?.scoresByCategory?.['best-practices']),
              S: pct(scan.summary?.scoresByCategory?.seo),
            }"
            :key="key"
            :score="score"
            :label="key"
            :bg-class="[getScoreBg(score), getScoreColor(score)]"
          />
        </div>
      </NuxtLink>
    </div>

    <div v-else class="rounded-sm ring-1 ring-default bg-elevated/40 px-6 py-16 text-center">
      <UIcon name="i-heroicons-clock" class="size-8 text-dimmed mx-auto mb-3" />
      <p class="text-muted">
        No scans found for <span class="font-mono">{{ host }}</span>.
      </p>
    </div>
  </div>
</template>
