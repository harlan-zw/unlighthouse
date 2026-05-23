<script setup lang="ts">
// Tiny inline SVG sparkline for a sequence of 0..100 scores. Renders nothing
// when there are fewer than 2 points (a single dot would be misleading).

const props = withDefaults(defineProps<{
  values: number[]
  width?: number
  height?: number
}>(), {
  width: 96,
  height: 24,
})

const path = computed(() => {
  const vs = props.values
  if (vs.length < 2)
    return ''
  const w = props.width
  const h = props.height
  const stepX = w / (vs.length - 1)
  return vs
    .map((v, i) => {
      const x = i * stepX
      const y = h - (Math.max(0, Math.min(100, v)) / 100) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const last = computed(() => props.values[props.values.length - 1])
const stroke = computed(() => {
  const v = last.value
  if (v == null)
    return 'var(--ui-text-dimmed)'
  if (v >= 90)
    return 'var(--ui-success, #22c55e)'
  if (v >= 50)
    return 'var(--ui-warning, #f59e0b)'
  return 'var(--ui-error, #ef4444)'
})
</script>

<template>
  <div v-if="values.length >= 2" class="inline-flex items-center" :style="{ width: `${width}px`, height: `${height}px` }">
    <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" aria-hidden="true" class="overflow-visible">
      <path :d="path" fill="none" :stroke="stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
  <div v-else class="text-[10px] text-dimmed">
    no trend
  </div>
</template>
