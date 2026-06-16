<script setup lang="ts">
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
    default: return 'text-zinc-500'
  }
}

function levelIcon(level: string) {
  switch (level) {
    case 'error': return 'lucide:x-circle'
    case 'warn': return 'lucide:alert-triangle'
    case 'success': return 'lucide:check-circle'
    default: return 'lucide:info'
  }
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="rounded-lg border bg-zinc-950 text-zinc-100 font-mono text-xs overflow-hidden">
    <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
      <div class="flex items-center gap-2">
        <div class="flex gap-1">
          <div class="size-2.5 rounded-full bg-red-500/60" />
          <div class="size-2.5 rounded-full bg-yellow-500/60" />
          <div class="size-2.5 rounded-full bg-green-500/60" />
        </div>
        <span class="text-zinc-500 text-[11px]">Terminal</span>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-zinc-500 text-[11px] cursor-pointer select-none">
          <input v-model="autoScroll" type="checkbox" class="size-3 accent-primary rounded" />
          Auto-scroll
        </label>
        <span class="text-zinc-600 tabular-nums text-[11px]">{{ store.logs.length }}</span>
      </div>
    </div>
    <div ref="scrollRef" class="h-48 overflow-y-auto p-2 space-y-px">
      <div v-if="!store.logs.length" class="text-zinc-600 py-8 text-center">
        Waiting for scan events...
      </div>
      <div
        v-for="log in store.logs"
        :key="log.id"
        class="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-zinc-900/60"
      >
        <span class="text-zinc-600 shrink-0 pt-px">{{ formatTime(log.timestamp) }}</span>
        <Icon :name="levelIcon(log.level)" :class="levelColor(log.level)" class="size-3 shrink-0 mt-0.5" />
        <span class="text-zinc-300 break-all leading-relaxed">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>
