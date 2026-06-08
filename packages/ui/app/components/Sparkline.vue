<script setup lang="ts">
// Tiny dependency-free sparkline for table cells. Fixed viewBox + non-scaling
// stroke so it stretches to the cell width without a ResizeObserver.
const props = defineProps<{
  values: number[]
  color?: string
  min?: number
  max?: number
}>()

const W = 100
const H = 28

const path = computed(() => {
  const vals = props.values
  if (vals.length < 2)
    return ''
  const min = props.min ?? Math.min(...vals)
  const max = props.max ?? Math.max(...vals)
  const span = max - min || 1
  return vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * W
      const y = H - ((v - min) / span) * H
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})
const last = computed(() => (props.values.length ? props.values[props.values.length - 1]! : null))
const lastPos = computed(() => {
  if (last.value == null || props.values.length < 2)
    return null
  const min = props.min ?? Math.min(...props.values)
  const max = props.max ?? Math.max(...props.values)
  const span = max - min || 1
  return { x: W, y: H - ((last.value - min) / span) * H }
})
</script>

<template>
  <svg v-if="path" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="w-full h-7 overflow-visible">
    <path :d="path" fill="none" :stroke="color || 'currentColor'" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
    <circle v-if="lastPos" :cx="lastPos.x" :cy="lastPos.y" r="2" :fill="color || 'currentColor'" vector-effect="non-scaling-stroke" />
  </svg>
  <span v-else class="text-[10px] text-muted/60">—</span>
</template>
