<script lang="ts" setup>
import { GAUGE_CONSTANTS } from '~/constants'

const props = defineProps<{
  score?: number
  stripped?: boolean
  label?: string
}>()

const arc = ref(null)

const guageModifiers = computed(() => {
  const score = props.score ?? 0
  let result = 'fail'
  if (score >= 0.9)
    result = 'pass'
  else if (score >= 0.5)
    result = 'average'
  return [`guage__wrapper--${result}`]
})

const gaugeColorClasses = computed(() => {
  const score = props.score ?? 0
  if (score >= 0.9)
    return 'text-success fill-current stroke-current'
  if (score >= 0.5)
    return 'text-warning fill-current stroke-current'
  return 'text-error fill-current stroke-current'
})

const dotColorClasses = computed(() => {
  const score = props.score ?? 0
  if (score >= 0.9)
    return 'bg-green-500'
  if (score >= 0.5)
    return 'bg-yellow-500'
  return 'bg-red-500'
})

const guageArcStyle = computed(() => {
  const { RADIUS, CIRCUMFERENCE, ROTATION_OFFSET } = GAUGE_CONSTANTS
  const score = props.score ?? 0

  let offset = score * CIRCUMFERENCE - RADIUS / 2
  if (score === 1)
    offset = CIRCUMFERENCE

  return {
    opacity: score === 0 ? '0' : 1,
    transform: `rotate(${360 * ROTATION_OFFSET - 90}deg)`,
    strokeDasharray: `${Math.max(offset, 0)}, ${CIRCUMFERENCE}`,
  }
})

const displayScore = computed(() => {
  if (props.score == null)
    return '?'
  return Math.round(props.score * 100)
})
</script>

<template>
  <div v-if="props.stripped" :class="guageModifiers" class="flex items-center gap-1">
    <span
      class="inline-block w-2.5 h-2.5 rounded-full"
      :class="dotColorClasses"
    />
    <span class="text-sm font-medium">{{ displayScore }}</span>
  </div>

  <div v-else class="guage__wrapper guage__wrapper--huge" :class="[guageModifiers, gaugeColorClasses]">
    <div class="guage__svg-wrapper relative">
      <svg class="guage" viewBox="0 0 120 120">
        <circle
          class="guage-base"
          r="56"
          cx="60"
          cy="60"
          stroke-width="8"
        />
        <circle
          v-if="props.score != null"
          ref="arc"
          class="guage-arc"
          r="56"
          cx="60"
          cy="60"
          stroke-width="8"
          :style="guageArcStyle"
        />
      </svg>
      <div class="font-5xl font-bold left-[50%] top-[50%] transform -translate-y-[50%] -translate-x-[50%] absolute text-mono font-mono">
        {{ displayScore }}
      </div>
    </div>
    <div class="text-xs mt-2">
      {{ props.label }}
    </div>
  </div>
</template>

<style>
.guage__wrapper--huge {
  --gauge-circle-size: 40px;
}
.guage__wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  text-decoration: none;
  --transition-length: 1s;
  contain: content;
  will-change: opacity;
}
.guage__svg-wrapper {
  position: relative;
  height: var(--gauge-circle-size);
}
.guage {
  stroke-linecap: round;
  width: var(--gauge-circle-size);
  height: var(--gauge-circle-size);
}
.guage-base {
  opacity: 0.1;
}
.guage-arc {
  fill: none;
  transform-origin: 50% 50%;
  animation: load-gauge var(--transition-length) ease forwards;
  animation-delay: 250ms;
}
</style>
