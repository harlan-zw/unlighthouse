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
    case 'error': return 'text-error'
    case 'warn': return 'text-warning'
    case 'success': return 'text-success'
    default: return 'text-dimmed'
  }
}

function levelIcon(level: string) {
  switch (level) {
    case 'error': return 'error'
    case 'warn': return 'warning'
    case 'success': return 'success'
    default: return 'info'
  }
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="rounded-lg border border-default bg-elevated text-default font-mono text-xs overflow-hidden">
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-default">
      <div class="flex items-center gap-2">
        <div class="flex gap-1">
          <div class="size-2.5 rounded-full bg-error/60" />
          <div class="size-2.5 rounded-full bg-warning/60" />
          <div class="size-2.5 rounded-full bg-success/60" />
        </div>
        <span class="text-dimmed text-[11px]">Terminal</span>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-dimmed text-[11px] cursor-pointer select-none">
          <input v-model="autoScroll" type="checkbox" class="size-3 accent-primary rounded">
          Auto-scroll
        </label>
        <span class="text-muted tabular-nums text-[11px]">{{ store.logs.length }}</span>
      </div>
    </div>
    <div ref="scrollRef" class="h-48 overflow-y-auto p-2 space-y-px">
      <div v-if="!store.logs.length" class="text-dimmed py-8 text-center">
        Waiting for scan events...
      </div>
      <div
        v-for="log in store.logs"
        :key="log.id"
        class="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-muted/60"
      >
        <span class="text-dimmed shrink-0 pt-px">{{ formatTime(log.timestamp) }}</span>
        <UiIcon :name="levelIcon(log.level)" :class="levelColor(log.level)" class="size-3 shrink-0 mt-0.5" />
        <span class="text-default break-all leading-relaxed">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>
