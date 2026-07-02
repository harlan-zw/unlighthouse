<script setup lang="ts">
// D-051: composes the DS UiProgressCircle for the ring geometry instead of
// duplicating the circumference/dashoffset SVG math. UiProgressCircle has no
// per-instance color prop (its arc is a fixed `stroke-primary-300` utility),
// so the score color rides in via a locally-scoped `--ui-color-primary-300`
// CSS-var override — contained to this component's own subtree, doesn't leak.
// One unavoidable visual delta from composing rather than duplicating: the DS
// primitive's arc cap is `butt`, not the previous hand-rolled `round`.
const props = withDefaults(defineProps<{
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  label?: string
}>(), {
  size: 'md',
})

const { scoreToRingColor, scoreToLabel } = createScoreColorHelpers()

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

const color = computed(() => scoreToRingColor(props.score))
const percent = computed(() => (props.score === null ? 0 : Math.round(props.score * 100)))
</script>

<template>
  <div
    class="relative inline-flex items-center justify-center"
    :style="{ '--ui-color-primary-300': color }"
  >
    <UiProgressCircle
      :percent="percent"
      :size="dimensions"
      :stroke-size="strokeWidth"
      :label="label"
      class="transition-[stroke-dashoffset] duration-300 ease-[var(--ease-standard)]"
    />
    <span
      class="absolute font-bold tabular-nums"
      :class="fontSize"
      :style="{ color }"
    >
      {{ scoreToLabel(score) }}
    </span>
  </div>
</template>
