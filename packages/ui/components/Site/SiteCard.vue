<script setup lang="ts">
import type { Site } from '~/composables/sites'
import { getScoreBg, getScoreColor } from '~/composables/dashboard'
import { siteAvgScore, siteHostname } from '~/composables/sites'

const { site } = defineProps<{ site: Site }>()

const avg = computed(() => siteAvgScore(site.latestScores))
const lastScan = computed(() => site.scans[0])
const trend = computed(() => {
  const t = site.trend
  if (t.length < 2)
    return 0
  return t[t.length - 1]! - t[0]!
})

const sparkPath = computed(() => {
  const t = site.trend
  if (!t.length)
    return ''
  const w = 100
  const h = 28
  const min = Math.min(...t)
  const max = Math.max(...t)
  const range = Math.max(1, max - min)
  return t.map((v, i) => {
    const x = (i / (t.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})

function timeAgo(iso: string | undefined) {
  if (!iso)
    return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86_400_000)
  if (d === 0)
    return 'today'
  if (d === 1)
    return '1d ago'
  if (d < 7)
    return `${d}d ago`
  if (d < 30)
    return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}
</script>

<template>
  <NuxtLink
    :to="`/sites/${site.id}`"
    class="block group rounded-xl ring-1 ring-default bg-elevated/40 hover:bg-elevated/70 transition-colors p-4"
  >
    <div class="flex items-start gap-3 mb-4">
      <img
        :src="`https://www.google.com/s2/favicons?domain=${siteHostname(site.url)}&sz=64`"
        :alt="site.name"
        class="size-8 rounded shrink-0"
        loading="lazy"
        width="32"
        height="32"
      >
      <div class="flex-1 min-w-0">
        <div class="font-medium text-highlighted truncate">
          {{ site.name }}
        </div>
        <div class="text-xs text-dimmed font-mono truncate">
          {{ siteHostname(site.url) }}
        </div>
      </div>
      <div
        v-if="avg !== null"
        class="size-10 rounded-lg flex items-center justify-center font-mono font-bold text-base shrink-0"
        :class="[getScoreBg(avg), getScoreColor(avg)]"
      >
        {{ avg }}
      </div>
    </div>

    <div class="flex items-end gap-2 mb-3">
      <svg viewBox="0 0 100 28" class="flex-1 h-7 text-primary/70" preserveAspectRatio="none">
        <path :d="sparkPath" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <div v-if="site.trend.length >= 2" class="flex items-center gap-1 text-[11px] shrink-0" :class="trend >= 0 ? 'text-success' : 'text-error'">
        <UIcon :name="trend >= 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'" class="size-3" aria-hidden="true" />
        {{ Math.abs(trend) }}
      </div>
    </div>

    <div class="grid grid-cols-4 gap-1.5">
      <div
        v-for="(score, key) in { Perf: site.latestScores.performance, A11y: site.latestScores.accessibility, Best: site.latestScores.bestPractices, SEO: site.latestScores.seo }"
        :key="key"
        class="text-center"
      >
        <div
          class="h-7 rounded flex items-center justify-center font-mono text-xs"
          :class="[getScoreBg(score), getScoreColor(score)]"
        >
          {{ score ?? '—' }}
        </div>
        <div class="text-[10px] text-dimmed mt-0.5">
          {{ key }}
        </div>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-default flex items-center justify-between text-[11px] text-dimmed">
      <span class="capitalize">{{ site.device }}</span>
      <span>Last scan {{ timeAgo(lastScan?.startedAt) }}</span>
    </div>
  </NuxtLink>
</template>
