<script setup lang="ts">
// Port of nuxtseo/core UiStats. Swaps tailwind-merge for a plain
// filter+join — the component doesn't generate conflicting Tailwind classes,
// and consumer `class` attrs cascade normally via the class attribute merge.

import type { UiStatProps } from './UiStat.vue'
import { computed, useSlots } from 'vue'

const {
  data,
  variant = 'card',
  layout = 'flex',
  wrap = false,
} = defineProps<{
  data: UiStatProps[]
  variant?: 'card' | 'cards' | 'inline'
  layout?: 'flex' | 'grid'
  wrap?: boolean
}>()

const gridCols = [
  'lg:grid-cols-1 md:grid-cols-2',
  'lg:grid-cols-2 md:grid-cols-2',
  'lg:grid-cols-3 md:grid-cols-2',
  'lg:grid-cols-4 md:grid-cols-2',
  'lg:grid-cols-5 md:grid-cols-3',
  'lg:grid-cols-6 md:grid-cols-3',
  'lg:grid-cols-7 md:grid-cols-4',
  'lg:grid-cols-8 md:grid-cols-4',
]

function join(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

const containerClass = computed(() => {
  const length = data.length
  const gridIndex = length > 0 && length < gridCols.length ? length - 1 : 0
  const isGrid = layout === 'grid' || variant === 'cards'
  return join(
    'justify-around',
    isGrid ? `grid grid-cols-1 sm:grid-cols-2 ${gridCols[gridIndex]}` : 'flex flex-col md:flex-row',
    wrap && 'flex-wrap',
    variant === 'card' && 'divide-y md:divide-y-0 md:divide-x divide-[var(--ui-border-muted)] rounded-lg border border-default py-4',
    variant === 'cards' && 'gap-4',
    // Consumer `class` is merged onto the root automatically by Vue's
    // attribute fallthrough (reactive), so it isn't joined in here.
  )
})

const statClass = computed(() =>
  join(
    variant === 'card' && 'shrink-0 grow',
    variant === 'card' && 'px-5 py-2 md:py-0',
  ),
)

const slots = useSlots()
</script>

<template>
  <div data-ui="UiStats" :class="containerClass">
    <template v-for="(item, index) in data" :key="item.title">
      <slot v-if="slots.default" v-bind="{ item, index }" />
      <template v-else>
        <UiStat
          v-bind="item"
          :card="variant === 'cards'"
          :trend-colored="item.trendColored ?? (variant === 'cards')"
          :class="statClass"
        />
      </template>
    </template>
  </div>
</template>
