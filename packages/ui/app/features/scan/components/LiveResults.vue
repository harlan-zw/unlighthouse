<script setup lang="ts">
import { useScanBase } from '~/features/scan/route-context'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const { scoreToLabel, scoreToColor, scoreToRingColor } = createScoreColorHelpers()

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
  catch (_err) {
    // Malformed live-result URLs fall back to the routes index.
    router.push(`${scanBase.value}/routes`)
  }
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname || '/'
  }
  catch (_err) {
    // Non-URL values are displayed as-is.
    return url
  }
}

const { fmtRelTime: ageLabel } = createFormatters()
</script>

<template>
  <div v-if="store.recentRoutes.length" class="rounded-lg border border-default bg-[var(--ui-bg-elevated)]/35 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <h2 class="text-label text-dimmed">
        Live results
      </h2>
      <span class="text-xs text-muted tabular-nums">
        last {{ store.recentRoutes.length }}
      </span>
    </div>
    <div class="divide-y max-h-80 overflow-y-auto">
      <UiTooltip
        v-for="r in store.recentRoutes"
        :key="r.url + r.timestamp"
        :text="r.url"
        side="top"
        size="lg"
        trigger-as="child"
      >
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-elevated/50"
          :aria-label="`Open ${r.url}`"
          @click="openRoute(r.url)"
        >
          <span
            class="size-1.5 rounded-full shrink-0"
            :style="{ backgroundColor: scoreToRingColor(r.score) }"
            aria-hidden="true"
          />
          <span class="font-mono text-xs truncate block">{{ pathFromUrl(r.url) }}</span>
          <span class="text-xs tabular-nums shrink-0 w-10 text-right font-bold" :class="scoreToColor(r.score)">
            {{ scoreToLabel(r.score) }}
          </span>
          <span class="text-xs text-muted tabular-nums shrink-0 w-14 text-right">
            {{ ageLabel(r.timestamp) }}
          </span>
        </button>
      </UiTooltip>
    </div>
  </div>
</template>
