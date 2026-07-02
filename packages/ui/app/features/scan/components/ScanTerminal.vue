<script setup lang="ts">
import { useScanStore } from '~/stores/scan'

const store = useScanStore()

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
  <LogStream title="Terminal" :count="store.logs.length">
    <template #empty>
      Waiting for scan events...
    </template>
    <div
      v-for="log in store.logs"
      :key="log.id"
      class="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-muted/60"
    >
      <span class="text-dimmed shrink-0 pt-px">{{ formatTime(log.timestamp) }}</span>
      <UiIcon :name="levelIcon(log.level)" :class="levelColor(log.level)" class="size-3 shrink-0 mt-0.5" />
      <span class="text-default break-all leading-relaxed">{{ log.message }}</span>
    </div>
  </LogStream>
</template>
