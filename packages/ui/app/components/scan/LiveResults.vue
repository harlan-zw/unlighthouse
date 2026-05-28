<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const { scoreToLabel, scoreToColor } = useScoreColor()

const route = useRoute()
const router = useRouter()
const scanId = computed(() => route.params.id as string)

function openRoute(url: string) {
  // The recentRoutes feed only carries the full URL; reconstruct the
  // path the route detail page expects from the URL's pathname so deep
  // links work even when the scan crawled a host with a non-/ base.
  try {
    const path = new URL(url).pathname || '/'
    router.push(`/scan/${scanId.value}/route/${encodeURIComponent(path)}`)
  }
  catch {
    router.push(`/scan/${scanId.value}/routes`)
  }
}

function pathFromUrl(url: string): string {
  try { return new URL(url).pathname || '/' }
  catch { return url }
}

const { fmtRelTime: ageLabel } = useFormat()
</script>

<template>
  <Card v-if="store.recentRoutes.length">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Live results
        </CardTitle>
        <span class="text-[10px] text-muted-foreground tabular-nums">
          last {{ store.recentRoutes.length }}
        </span>
      </div>
    </CardHeader>
    <CardContent class="p-0">
      <div class="divide-y max-h-80 overflow-y-auto">
        <button
          v-for="r in store.recentRoutes"
          :key="r.url + r.timestamp"
          type="button"
          class="flex items-center gap-3 px-4 py-2 text-left w-full hover:bg-muted/50 transition-colors"
          @click="openRoute(r.url)"
        >
          <span
            class="size-1.5 rounded-full shrink-0"
            :style="{ backgroundColor: r.score == null ? 'var(--muted-foreground)' : (r.score >= 0.9 ? '#22c55e' : r.score >= 0.5 ? '#f97316' : '#ef4444') }"
          />
          <span class="font-mono text-xs truncate flex-1">{{ pathFromUrl(r.url) }}</span>
          <span class="text-xs tabular-nums shrink-0 w-10 text-right font-bold" :class="scoreToColor(r.score)">
            {{ scoreToLabel(r.score) }}
          </span>
          <span class="text-[10px] text-muted-foreground tabular-nums shrink-0 w-14 text-right">
            {{ ageLabel(r.timestamp) }}
          </span>
        </button>
      </div>
    </CardContent>
  </Card>
</template>
