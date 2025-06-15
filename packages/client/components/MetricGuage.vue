<script lang="ts" setup>
import { GAUGE_CONSTANTS } from '../constants'

const props = defineProps<{
  score?: number
  stripped?: boolean
  label?: string
}>()

// Direct prop access is more efficient than toRefs when not destructuring

const arc = ref(null)

const guageModifiers = computed(() => {
  let result = 'fail'
  if (props.score >= 0.9)
    result = 'pass'
  else if (props.score >= 0.5)
    result = 'average'

  return [
    `guage__wrapper--${result}`,
  ]
})

const gaugeColorClasses = computed(() => {
  if (props.score >= 0.9) {
    return 'text-success fill-current stroke-current'
  } else if (props.score >= 0.5) {
    return 'text-warning fill-current stroke-current'
  } else {
    return 'text-error fill-current stroke-current'
  }
})

const guageArcStyle = computed(() => {
  const { RADIUS, CIRCUMFERENCE, ROTATION_OFFSET } = GAUGE_CONSTANTS
  
  let offset = props.score * CIRCUMFERENCE - RADIUS / 2
  if (props.score === 1)
    offset = CIRCUMFERENCE

  return {
    opacity: props.score === 0 ? '0' : 1,
    transform: `rotate(${360 * ROTATION_OFFSET - 90}deg)`,
    strokeDasharray: `${Math.max(offset, 0)}, ${CIRCUMFERENCE}`,
  }
})
</script>

<template>
  <div v-if="props.stripped" :class="guageModifiers">
    <audit-result :value="{ score: props.score, displayValue: Math.round(props.score * 100) }" />
  </div>

  <div v-else class="guage__wrapper guage__wrapper--huge" :class="[guageModifiers, gaugeColorClasses]">
    <div
      class="guage__svg-wrapper relative"
    >
      <svg class="guage" viewBox="0 0 120 120">
        <circle
          class="guage-base"
          r="56"
          cx="60"
          cy="60"
          stroke-width="8"
        />
        <circle
          v-if="props.score !== null"
          ref="arc"
          class="guage-arc"
          r="56"
          cx="60"
          cy="60"
          stroke-width="8"
          :style="guageArcStyle"
        />
      </svg>
      <div
        class="font-5xl font-bold left-[50%] top-[50%] transform -translate-y-[50%] -translate-x-[50%] absolute text-mono font-mono"
      >
        {{ props.score === null ? '?' : Math.round(props.score * 100) }}
      </div>
    </div>
    <div class="text-xs mt-2">
      {{ props.label }}
    </div>
  </div>
</template>

<style>
* {
  --color-amber-50: #fff8e1;
  --color-blue-200: #90caf9;
  --color-blue-900: #0d47a1;
  --color-blue-A700: #2962ff;
  --color-cyan-500: #00bcd4;
  --color-gray-100: #f5f5f5;
  --color-gray-300: #cfcfcf;
  --color-gray-200: #e0e0e0;
  --color-gray-400: #bdbdbd;
  --color-gray-50: #fafafa;
  --color-gray-500: #9e9e9e;
  --color-gray-600: #757575;
  --color-gray-700: #616161;
  --color-gray-800: #424242;
  --color-gray-900: #212121;
  --color-gray: #000000;
  --color-green-700: #018642;
  --color-green: #0cce6b;
  --color-lime-400: #d3e156;
  --color-orange-50: #fff3e0;
  --color-orange-700: #d04900;
  --color-orange: #ffa400;
  --color-red-700: #eb0f00;
  --color-red: #ff4e42;
  --color-teal-600: #00897b;
  --color-white: #ffffff;
  --color-average-secondary: var(--color-orange-700);
  --color-average: var(--color-orange);
  --color-fail-secondary: var(--color-red-700);
  --color-fail: var(--color-red);
  --color-hover: var(--color-gray-50);
  --color-informative: var(--color-blue-900);
  --color-pass-secondary: var(--color-green-700);
  --color-pass: var(--color-green);
  --color-not-applicable: var(--color-gray-600);
}
/* Color classes are now handled in template via gaugeColorClasses computed */

.guage__wrapper--not-applicable {
  color: var(--color-not-applicable);
  fill: var(--color-not-applicable);
  stroke: var(--color-not-applicable);
}
.guage__wrapper--huge {
  --gauge-circle-size: 40px;
}
.guage__wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  text-decoration: none;
  padding: var(--score-container-padding);
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
