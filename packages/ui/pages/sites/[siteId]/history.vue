<script setup lang="ts">
import { useSites } from '~/composables/sites'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { getSite } = useSites()
const site = getSite(route.params.siteId as string)

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div v-if="site">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Scan history
      </h1>
      <p class="text-sm text-muted mt-1">
        {{ site.scans.length }} scan{{ site.scans.length === 1 ? '' : 's' }} for {{ site.name }}
      </p>
    </header>

    <div v-if="site.scans.length" class="rounded-xl ring-1 ring-default bg-elevated/40 overflow-hidden">
      <NuxtLink
        v-for="scan in site.scans"
        :key="scan.id"
        :to="`/results/${encodeURIComponent(scan.id)}`"
        class="flex items-center gap-4 px-4 py-3 hover:bg-elevated/60 transition-colors border-b border-default last:border-b-0"
      >
        <span class="text-sm text-muted w-44">{{ fmt(scan.startedAt) }}</span>
        <span class="text-xs text-dimmed capitalize w-16">{{ scan.device }}</span>
        <span class="text-xs text-dimmed">{{ scan.routes }} routes</span>
        <span
          class="text-[11px] px-1.5 py-0.5 rounded"
          :class="scan.status === 'complete' ? 'bg-success/10 text-success'
            : scan.status === 'failed' ? 'bg-error/10 text-error'
              : scan.status === 'running' ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
        >
          {{ scan.status }}
        </span>
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

    <div v-else class="rounded-xl ring-1 ring-default bg-elevated/40 px-6 py-16 text-center">
      <UIcon name="i-heroicons-clock" class="size-10 text-dimmed mx-auto mb-3" />
      <p class="text-muted mb-4">
        No scans yet.
      </p>
      <UButton :to="`/sites/${site.id}/scan/new`" icon="i-heroicons-bolt" color="primary">
        Run the first scan
      </UButton>
    </div>
  </div>
</template>
