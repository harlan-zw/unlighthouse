<script setup lang="ts">
const props = withDefaults(defineProps<{
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  label?: string
}>(), {
  size: 'md',
})

const { scoreToRingColor, scoreToLabel } = useScoreColor()

const dimensions = computed(() => {
  const map = { sm: 40, md: 64, lg: 96 }
  return map[props.size]
})

const strokeWidth = computed(() => {
  const map = { sm: 3, md: 4, lg: 5 }
  return map[props.size]
})

const fontSize = computed(() => {
  const map = { sm: 'text-xs', md: 'text-lg', lg: 'text-2xl' }
  return map[props.size]
})

const radius = computed(() => (dimensions.value - strokeWidth.value) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => {
  if (props.score === null) return circumference.value
  return circumference.value * (1 - props.score)
})
const color = computed(() => scoreToRingColor(props.score))
</script>

<template>
  <div class="relative inline-flex items-center justify-center" :style="{ width: `${dimensions}px`, height: `${dimensions}px` }">
    <svg :width="dimensions" :height="dimensions" class="-rotate-90">
      <circle
        :cx="dimensions / 2"
        :cy="dimensions / 2"
        :r="radius"
        fill="none"
        :stroke-width="strokeWidth"
        class="stroke-[var(--ui-bg-elevated)]"
      />
      <circle
        :cx="dimensions / 2"
        :cy="dimensions / 2"
        :r="radius"
        fill="none"
        :stroke-width="strokeWidth"
        :stroke="color"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        class="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
    <span
      class="absolute font-bold tabular-nums"
      :class="fontSize"
      :style="{ color }"
    >
      {{ scoreToLabel(score) }}
    </span>
  </div>
</template>
