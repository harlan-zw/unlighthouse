<script setup lang="ts">
import { siteHostname, useSites } from '~/composables/sites'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { getSite } = useSites()
const site = getSite(route.params.siteId as string)
const client = useApiClient()

const { data, pending } = await useAsyncData(
  () => `site-recent:${route.params.siteId}`,
  async () => {
    if (!site.value)
      return { items: [] }
    return client['history.list']({ site: site.value.url, page: 1, pageSize: 5 })
  },
  { watch: [() => site.value?.url] },
)

const scans = computed(() => data.value?.items ?? [])

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function pct(s: number | null | undefined) {
  return s == null ? null : Math.round(s * 100)
}
</script>

<template>
  <div v-if="site">
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted flex items-center gap-2">
          <SiteFavicon :url="site.url" :alt="site.name" class="size-5" />
          {{ site.name }}
        </h1>
        <a :href="site.url" target="_blank" class="text-sm text-muted font-mono hover:text-default transition-colors">
          {{ siteHostname(site.url) }}
        </a>
      </div>
      <UiMotionButton intensity="cta" color="primary" icon="i-heroicons-bolt" :to="`/sites/${site.id}/scan/new`">
        Run scan
      </UiMotionButton>
    </header>

    <div class="rounded-sm ring-1 ring-default bg-elevated/40 overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-default">
        <h2 class="font-medium text-highlighted">
          Recent scans
        </h2>
        <NuxtLink :to="`/sites/${site.id}/history`" class="text-xs text-muted hover:text-default transition-colors">
          View all →
        </NuxtLink>
      </div>

      <div v-if="pending" class="px-4 py-8 text-center text-sm text-dimmed">
        Loading…
      </div>

      <div v-else-if="scans.length">
        <NuxtLink
          v-for="scan in scans"
          :key="scan.scanId"
          :to="`/results/${encodeURIComponent(scan.scanId)}`"
          class="flex items-center gap-4 px-4 py-3 hover:bg-elevated/60 transition-colors border-b border-default last:border-b-0"
        >
          <span class="text-sm text-muted w-44">{{ fmt(scan.startedAt) }}</span>
          <span class="text-xs text-dimmed capitalize w-16">{{ scan.device }}</span>
          <span class="text-xs text-dimmed">{{ scan.summary?.completed ?? 0 }}/{{ scan.summary?.routes ?? 0 }} routes</span>
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

      <div v-else class="px-4 py-8 text-center text-sm text-dimmed">
        No scans yet. <NuxtLink :to="`/sites/${site.id}/scan/new`" class="text-primary hover:underline">
          Run the first scan
        </NuxtLink>.
      </div>
    </div>
  </div>
</template>
