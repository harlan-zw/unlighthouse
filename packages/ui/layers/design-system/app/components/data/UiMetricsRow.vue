<script setup lang="ts">
interface MetricsRowItem {
  /** Preferred: Lucide icon name. Falls back to dotColor if not provided. */
  icon?: string
  /** Text color class applied to the icon. Prefer semantic or metric identity tokens. */
  iconClass?: string
  /** Legacy dot color class (used when no icon is provided). */
  dotColor?: string
  value: string
  label: string
  trend?: number | null
  trendInverted?: boolean
}

defineProps<{
  items: MetricsRowItem[]
}>()
</script>

<template>
  <div data-testid="metrics-row" class="flex items-center gap-3 sm:gap-4 mb-6 flex-wrap">
    <template v-for="(item, i) in items" :key="item.label">
      <div v-if="i > 0" class="w-px self-stretch bg-[var(--ui-border)] hidden sm:block" />
      <div class="flex items-center gap-2 sm:gap-3 leading-none tracking-data">
        <UiIcon
          v-if="item.icon"
          :name="item.icon"
          class="size-4 shrink-0 text-dimmed"
          aria-hidden="true"
        />
        <span class="text-2xl sm:text-4xl font-bold tracking-tight tabular-nums">
          {{ item.value }}
        </span>
        <div class="flex flex-col">
          <span class="text-xs text-muted">
            {{ item.label }}
          </span>
          <Transition
            enter-active-class="motion-safe:transition-[opacity,transform] motion-safe:duration-200 ease-out"
            enter-from-class="motion-safe:opacity-0 motion-safe:translate-y-0.5"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="motion-safe:transition-[opacity,transform] motion-safe:duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="motion-safe:opacity-0"
          >
            <UiTrend
              v-if="item.trend != null && item.trend !== 0"
              :value="item.trend"
              :inverted="item.trendInverted"
              colored
              format="percent"
              size="sm"
            />
            <span v-else class="text-xs text-dimmed tabular-nums" aria-label="No comparison data">—</span>
          </Transition>
        </div>
      </div>
    </template>
  </div>
</template>
