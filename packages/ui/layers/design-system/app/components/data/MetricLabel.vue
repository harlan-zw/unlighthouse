<script lang="ts" setup>
const { size = 'xs', tone = 'dimmed' } = defineProps<{
  label?: string
  /** xs = dense table/metric labels, sm = popover/list section labels */
  size?: 'xs' | 'sm'
  tone?: 'default' | 'muted' | 'dimmed' | 'success' | 'warning' | 'error'
}>()

// xs = the dense .text-label tier (10px); sm = a 12px label for popover/list
// section headings. (Both were 10px before — the sm tier was a dead no-op.)
const sizeClass = {
  xs: 'text-label',
  sm: 'text-xs uppercase tracking-wider font-semibold',
} as const

const toneClass = {
  default: 'text-default',
  muted: 'text-muted',
  dimmed: 'text-dimmed',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
} as const
</script>

<template>
  <span :class="[sizeClass[size], toneClass[tone]]">
    <slot>{{ label }}</slot>
  </span>
</template>
