<script setup lang="ts">
import { useScanBase } from '~/features/scan/route-context'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const { scoreToLabel, scoreToColor, scoreToRingColor } = useScoreColor()

const router = useRouter()
const { scanBase } = useScanBase()

function openRoute(url: string) {
  // The recentRoutes feed only carries the full URL; reconstruct the
  // path the route detail page expects from the URL's pathname so deep
  // links work even when the scan crawled a host with a non-/ base.
  try {
    const path = new URL(url).pathname || '/'
    router.push(`${scanBase.value}/route/${encodeURIComponent(path)}`)
  }
  catch {
    router.push(`${scanBase.value}/routes`)
  }
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname || '/'
  }
  catch {
    return url
  }
}

const { fmtRelTime: ageLabel } = useFormat()
</script>

<template>
  <div v-if="store.recentRoutes.length" class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <h3 class="text-label text-dimmed">
        Live results
      </h3>
      <span class="text-[10px] text-muted tabular-nums">
        last {{ store.recentRoutes.length }}
      </span>
    </div>
    <div class="divide-y max-h-80 overflow-y-auto">
      <button
        v-for="r in store.recentRoutes"
        :key="r.url + r.timestamp"
        type="button"
        class="flex items-center gap-3 px-4 py-2 text-left w-full hover:bg-elevated/50 transition-colors"
        @click="openRoute(r.url)"
      >
        <span
          class="size-1.5 rounded-full shrink-0"
          :style="{ backgroundColor: scoreToRingColor(r.score) }"
        />
        <span class="font-mono text-xs truncate flex-1">{{ pathFromUrl(r.url) }}</span>
        <span class="text-xs tabular-nums shrink-0 w-10 text-right font-bold" :class="scoreToColor(r.score)">
          {{ scoreToLabel(r.score) }}
        </span>
        <span class="text-[10px] text-muted tabular-nums shrink-0 w-14 text-right">
          {{ ageLabel(r.timestamp) }}
        </span>
      </button>
    </div>
  </div>
</template>
