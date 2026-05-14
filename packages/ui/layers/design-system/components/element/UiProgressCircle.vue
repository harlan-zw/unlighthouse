<script lang="ts" setup>
import { computed } from 'vue'

/**
 * UiProgressCircle
 *
 * Shows a circular progres
 */
interface Props {
  percent?: number | string
  size?: number | string
  strokeSize?: number | string
  lighter?: boolean
}

const { percent = 0, size = 36, strokeSize = 4, lighter } = defineProps<Props>()

const style = computed(() => ({
  width: `${size}px`,
  height: `${size}px`,
}))

const svg = computed(() => ({
  'view-box': `0 0 ${size} ${size}`,
  'stroke-width': strokeSize,
  'fill': 'none',
}))

const circle = computed(() => {
  const r = Number(size) / 2
  return {
    cx: r,
    cy: r,
    r: Math.max(1, r - Number(strokeSize) / 2),
  }
})

const offset = computed(() => clamp(100 - Number(percent), 0, 100))

const bg = computed(() => {
  return lighter
    ? 'stroke-[var(--ui-bg-accented)]'
    : 'stroke-[var(--ui-border)]'
})
</script>

<template>
  <div data-ui="UiProgressCircle" :style="style" class="relative shrink-0" role="progressbar" :aria-valuenow="Number(percent)" :aria-valuemin="0" :aria-valuemax="100">
    <svg
      v-bind="svg"
      :class="bg"
      class="absolute inset-0 w-full h-full"
    >
      <circle v-bind="circle" />
    </svg>
    <svg
      v-bind="svg"
      :stroke-dashoffset="offset"
      :stroke-dasharray="100"
      stroke-linecap="butt"
      class="absolute inset-0 w-full h-full -rotate-90 stroke-primary-300"
    >
      <circle v-bind="circle" pathLength="100" />
    </svg>
  </div>
</template>
