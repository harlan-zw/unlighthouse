<script setup lang="ts">
import { useSites } from '~/composables/sites'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { getSite } = useSites()
const site = getSite(route.params.siteId as string)
const client = useApiClient()

const { data, pending } = await useAsyncData(
  () => `history:${route.params.siteId}`,
  async () => {
    if (!site.value)
      return { items: [] }
    return client['history.list']({ site: site.value.url, page: 1, pageSize: 100 })
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
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Scan history
      </h1>
      <p class="text-sm text-muted mt-1">
        {{ scans.length }} scan{{ scans.length === 1 ? '' : 's' }} for {{ site.name }}
      </p>
    </header>

    <div v-if="pending" class="text-sm text-dimmed">
      Loading…
    </div>

    <div v-else-if="scans.length" class="rounded-sm ring-1 ring-default bg-elevated/40 overflow-hidden">
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
          <div
            v-for="(score, key) in {
              P: pct(scan.summary?.scoresByCategory?.performance),
              A: pct(scan.summary?.scoresByCategory?.accessibility),
              B: pct(scan.summary?.scoresByCategory?.['best-practices']),
              S: pct(scan.summary?.scoresByCategory?.seo),
            }"
            :key="key"
            class="size-8 rounded flex items-center justify-center font-mono text-[11px]"
            :class="[getScoreBg(score), getScoreColor(score)]"
          >
            {{ score ?? '—' }}
          </div>
        </div>
      </NuxtLink>
    </div>

    <div v-else class="rounded-sm ring-1 ring-default bg-elevated/40 px-6 py-16 text-center">
      <UIcon name="i-heroicons-clock" class="size-8 text-dimmed mx-auto mb-3" />
      <p class="text-muted mb-4">
        Run a scan to surface render-blocking resources, image weight, and a11y gaps.
      </p>
      <UiMotionButton intensity="cta" :to="`/sites/${site.id}/scan/new`" icon="i-heroicons-bolt" color="primary">
        Run scan
      </UiMotionButton>
    </div>
  </div>
</template>
