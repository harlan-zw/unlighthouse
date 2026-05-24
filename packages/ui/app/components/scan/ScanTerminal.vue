<script setup lang="ts">
import { ScrollArea } from '@/components/ui/scroll-area'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const scrollRef = ref<HTMLElement>()
const autoScroll = ref(true)

watch(() => store.logs.length, () => {
  if (autoScroll.value) {
    nextTick(() => {
      if (scrollRef.value) {
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight
      }
    })
  }
})

function levelColor(level: string) {
  switch (level) {
    case 'error': return 'text-red-400'
    case 'warn': return 'text-yellow-400'
    case 'success': return 'text-green-400'
    default: return 'text-zinc-400'
  }
}

function levelPrefix(level: string) {
  switch (level) {
    case 'error': return 'ERR'
    case 'warn': return 'WRN'
    case 'success': return ' OK'
    default: return 'INF'
  }
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="rounded-lg border bg-zinc-950 text-zinc-100 font-mono text-xs overflow-hidden">
    <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
      <span class="text-zinc-400 text-[11px]">Terminal</span>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 text-zinc-500 text-[11px] cursor-pointer">
          <input v-model="autoScroll" type="checkbox" class="size-3 accent-primary" />
          Auto-scroll
        </label>
        <span class="text-zinc-600 tabular-nums text-[11px]">{{ store.logs.length }} lines</span>
      </div>
    </div>
    <div ref="scrollRef" class="h-64 overflow-y-auto p-2 space-y-px">
      <div v-if="!store.logs.length" class="text-zinc-600 py-4 text-center">
        Waiting for scan events...
      </div>
      <div
        v-for="log in store.logs"
        :key="log.id"
        class="flex gap-2 leading-relaxed hover:bg-zinc-900/50 px-1 rounded"
      >
        <span class="text-zinc-600 shrink-0">{{ formatTime(log.timestamp) }}</span>
        <span :class="levelColor(log.level)" class="shrink-0">{{ levelPrefix(log.level) }}</span>
        <span class="text-zinc-300 break-all">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>
