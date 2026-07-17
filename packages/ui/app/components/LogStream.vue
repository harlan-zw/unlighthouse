<script setup lang="ts">
// App-global (D-051): terminal-ish log/stream chrome shared by ScanTerminal
// (scan CLI log lines) and EventStreamPanel (scan event NDJSON tail). Row
// shape genuinely diverges between the two (icon + plain message vs a
// severity chip + raw JSON payload), so this owns only what's actually
// duplicated: the dot-header chrome, the count/dropped note, the auto-scroll
// toggle + scroll-to-bottom behavior, and the empty state. Each consumer
// keeps its own data plumbing (store / event-stream composable) and renders
// its own rows through the default slot.

const props = withDefaults(defineProps<{
  title?: string
  /** Row count shown in the header — the row list itself lives in the
   *  default slot, so the count isn't derived here. */
  count: number
  /** CSS height of the scroll viewport, e.g. '12rem' or '65dvh'. */
  height?: string
  /** Trailing note next to the count, e.g. "12 trimmed". */
  droppedNote?: string
}>(), {
  title: 'Terminal',
  height: '12rem',
})

const autoScroll = defineModel<boolean>('autoScroll', { default: true })

const scrollRef = ref<HTMLElement>()
watch(() => props.count, () => {
  if (!autoScroll.value)
    return
  nextTick(() => {
    if (scrollRef.value)
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
})
</script>

<template>
  <div class="rounded-lg border border-default bg-elevated text-default font-mono text-xs overflow-hidden">
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-default">
      <div class="flex items-center gap-2">
        <div class="flex gap-1" aria-hidden="true">
          <div class="size-2.5 rounded-full bg-error/60" />
          <div class="size-2.5 rounded-full bg-warning/60" />
          <div class="size-2.5 rounded-full bg-success/60" />
        </div>
        <span class="text-dimmed text-xs">{{ title }}</span>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-dimmed text-xs cursor-pointer select-none">
          <input v-model="autoScroll" name="auto-scroll" type="checkbox" class="size-3 accent-primary rounded">
          Auto-scroll
        </label>
        <span class="text-muted tabular-nums text-xs">
          {{ count }}<template v-if="droppedNote"> · {{ droppedNote }}</template>
        </span>
      </div>
    </div>
    <div ref="scrollRef" class="overflow-y-auto p-2 space-y-px" :style="{ height }" role="log" aria-live="polite" :aria-label="title">
      <div v-if="!count" class="text-dimmed py-8 text-center">
        <slot name="empty">
          Waiting for events…
        </slot>
      </div>
      <slot />
    </div>
  </div>
</template>
