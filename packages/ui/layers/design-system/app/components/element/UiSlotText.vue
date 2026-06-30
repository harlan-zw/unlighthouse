<script setup lang="ts">
import type { SlotTextOptions } from '../../utils/slot-text'
import { useReducedMotion } from 'motion-v'
import { computed } from 'vue'

const { text, options } = defineProps<{
  text: string
  options?: SlotTextOptions
}>()

const reduced = useReducedMotion()

const resolvedOptions = computed<SlotTextOptions>(() => ({
  direction: 'up',
  stagger: 32,
  duration: 260,
  exitOffset: 38,
  ...options,
}))

const chars = computed(() => Array.from(text))
const directionClass = computed(() => resolvedOptions.value.direction === 'down' ? 'ui-slot-text--down' : 'ui-slot-text--up')

function glyph(char: string) {
  return char === ' ' ? '\u00A0' : char
}

function slotStyle(index: number) {
  return {
    '--ui-slot-delay': `${index * (resolvedOptions.value.stagger ?? 32)}ms`,
    '--ui-slot-duration': `${resolvedOptions.value.duration ?? 260}ms`,
    '--ui-slot-easing': resolvedOptions.value.easing ?? 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  }
}
</script>

<template>
  <span v-if="reduced" class="ui-slot-text-host">{{ text }}</span>
  <span v-else class="ui-slot-text-host ui-slot-text" :class="directionClass" :aria-label="text">
    <span
      v-for="(char, index) in chars"
      :key="index"
      class="ui-slot-text__slot"
      :style="slotStyle(index)"
      aria-hidden="true"
    >
      <span class="ui-slot-text__sizer">{{ glyph(char) }}</span>
      <Transition name="ui-slot-text-roll">
        <span :key="`${index}:${char}`" class="ui-slot-text__face">{{ glyph(char) }}</span>
      </Transition>
    </span>
  </span>
</template>
