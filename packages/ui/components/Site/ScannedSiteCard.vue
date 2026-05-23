<script setup lang="ts">
import type { ScannedSite } from '~/composables/useScannedSites'
import { getScoreBg, getScoreColor } from '~/utils'

const { site } = defineProps<{ site: ScannedSite }>()

// Prefer drilling into the registered-site view (history table, settings) when
// we have a registry match. Otherwise route to a host-keyed scan history view.
const to = computed(() =>
  site.registry
    ? `/sites/${site.registry.id}`
    : `/sites/scanned/${encodeURIComponent(site.host)}`,
)

function fmtRelative(iso: string | undefined) {
  if (!iso)
    return '—'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const m = Math.floor(diff / 60_000)
  if (m < 1)
    return 'just now'
  if (m < 60)
    return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)
    return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)
    return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

const latest = computed(() => site.latest)
const summary = computed(() => site.latestComplete?.summary ?? null)
</script>

<template>
  <NuxtLink
    :to="to"
    class="block group rounded-sm ring-1 ring-default bg-elevated/40 hover:bg-elevated/70 transition-colors p-4"
  >
    <div class="flex items-start gap-3 mb-4">
      <SiteFavicon :url="site.url" :sz="64" :alt="site.host" class="size-8" />
      <div class="flex-1 min-w-0">
        <div class="font-medium text-highlighted truncate">
          {{ site.registry?.name || site.host }}
        </div>
        <div class="text-xs text-dimmed font-mono truncate">
          {{ site.host }}
        </div>
      </div>
      <span
        v-if="!site.registry"
        class="text-[10px] uppercase tracking-wider text-dimmed px-1.5 py-0.5 rounded ring-1 ring-default"
        title="No matching site in the registry — scanned via override"
      >
        ad-hoc
      </span>
    </div>

    <div class="flex items-center gap-1.5 mb-4">
      <TableScoreTile
        v-for="(score, key) in {
          P: site.scores.performance,
          A: site.scores.accessibility,
          B: site.scores.bestPractices,
          S: site.scores.seo,
        }"
        :key="key"
        :score="score"
        :label="key"
        :bg-class="[getScoreBg(score), getScoreColor(score)]"
      />
      <div class="ml-auto">
        <SiteScoreSparkline :values="site.trend" />
      </div>
    </div>

    <div class="pt-3 border-t border-default flex items-center justify-between text-[11px] text-dimmed">
      <span>
        {{ site.scanCount }} scan{{ site.scanCount === 1 ? '' : 's' }}
        <span v-if="summary?.routes != null" class="ml-1">· {{ summary.routes }} routes</span>
      </span>
      <span>
        Last {{ fmtRelative(latest?.startedAt) }}
      </span>
    </div>
  </NuxtLink>
</template>
