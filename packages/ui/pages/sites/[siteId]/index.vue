<script setup lang="ts">
import { siteAvgScore, siteHostname, useSites } from '~/composables/sites'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { getSite } = useSites()
const site = getSite(route.params.siteId as string)

const avg = computed(() => site.value ? siteAvgScore(site.value.latestScores) : null)
const lastScan = computed(() => site.value?.scans[0])

function timeAgo(iso?: string) {
  if (!iso)
    return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0)
    return 'today'
  if (d === 1)
    return '1d ago'
  if (d < 30)
    return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

const sparkPath = computed(() => {
  if (!site.value)
    return ''
  const t = site.value.trend
  if (!t.length)
    return ''
  const w = 320
  const h = 60
  const min = Math.min(...t)
  const max = Math.max(...t)
  const range = Math.max(1, max - min)
  return t.map((v, i) => {
    const x = (i / (t.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})
</script>

<template>
  <div v-if="site">
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted flex items-center gap-2">
          <img
            :src="`https://www.google.com/s2/favicons?domain=${siteHostname(site.url)}&sz=32`"
            :alt="site.name"
            class="size-5 rounded"
            loading="lazy"
            width="20"
            height="20"
          >
          {{ site.name }}
        </h1>
        <a :href="site.url" target="_blank" class="text-sm text-muted font-mono hover:text-default transition-colors">
          {{ siteHostname(site.url) }}
        </a>
      </div>
      <UButton color="primary" icon="i-heroicons-bolt" :to="`/sites/${site.id}/scan/new`">
        Run scan
      </UButton>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <div class="lg:col-span-2 rounded-xl ring-1 ring-default bg-elevated/40 p-5">
        <div class="flex items-baseline justify-between mb-4">
          <div>
            <div class="text-xs text-dimmed uppercase tracking-widest">
              Average score
            </div>
            <div class="flex items-baseline gap-2 mt-1">
              <div class="text-4xl font-bold font-mono" :class="getScoreColor(avg)">
                {{ avg ?? '—' }}
              </div>
              <div class="text-xs text-dimmed">
                {{ site.trend.length }} scans
              </div>
            </div>
          </div>
          <div class="text-right text-xs text-dimmed">
            Last scan {{ timeAgo(lastScan?.startedAt) }}
          </div>
        </div>
        <svg viewBox="0 0 320 60" class="w-full h-16 text-primary/80" preserveAspectRatio="none">
          <path :d="sparkPath" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      </div>

      <div class="rounded-xl ring-1 ring-default bg-elevated/40 p-5">
        <div class="text-xs text-dimmed uppercase tracking-widest mb-4">
          Latest categories
        </div>
        <div class="space-y-3">
          <div v-for="(score, key) in { Performance: site.latestScores.performance, Accessibility: site.latestScores.accessibility, 'Best Practices': site.latestScores.bestPractices, SEO: site.latestScores.seo }" :key="key" class="flex items-center justify-between">
            <span class="text-sm text-muted">{{ key }}</span>
            <div
              class="size-8 rounded flex items-center justify-center font-mono text-xs"
              :class="[getScoreBg(score), getScoreColor(score)]"
            >
              {{ score ?? '—' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl ring-1 ring-default bg-elevated/40 overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-default">
        <h2 class="font-medium text-highlighted">
          Recent scans
        </h2>
        <NuxtLink :to="`/sites/${site.id}/history`" class="text-xs text-muted hover:text-default transition-colors">
          View all →
        </NuxtLink>
      </div>
      <div v-if="site.scans.length">
        <NuxtLink
          v-for="scan in site.scans.slice(0, 5)"
          :key="scan.id"
          :to="`/results/${encodeURIComponent(scan.id)}`"
          class="flex items-center gap-4 px-4 py-3 hover:bg-elevated/60 transition-colors border-b border-default last:border-b-0"
        >
          <span class="text-sm text-muted w-24">{{ timeAgo(scan.startedAt) }}</span>
          <span class="text-xs text-dimmed capitalize w-16">{{ scan.device }}</span>
          <span class="text-xs text-dimmed">{{ scan.routes }} routes</span>
          <div class="ml-auto flex items-center gap-1.5">
            <div
              v-for="(score, key) in { P: scan.scores.performance, A: scan.scores.accessibility, B: scan.scores.bestPractices, S: scan.scores.seo }"
              :key="key"
              class="size-7 rounded flex items-center justify-center font-mono text-[11px]"
              :class="[getScoreBg(score), getScoreColor(score)]"
            >
              {{ score ?? '—' }}
            </div>
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
