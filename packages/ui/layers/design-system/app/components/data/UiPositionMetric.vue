<script lang="ts" setup>
import { computed } from 'vue'

const { value } = defineProps<{ value: number | string, size?: string }>()

const val = Number(value)

const color = computed(() => {
  if (val < 10)
    return 'success'
  if (val < 20)
    return 'warning'
  if (val < 30)
    return 'warning'
  return 'error'
})

// Text equivalent of the color signal so position quality isn't conveyed by
// hue alone (WCAG 1.4.1) — voiced via the badge's aria-label.
const qualitative = computed(() => {
  if (val < 10)
    return 'strong'
  if (val < 30)
    return 'moderate'
  return 'weak'
})

const formattedValue = computed(() => Math.round(val))
</script>

<template>
  <UiTooltip trigger-as="button">
    <UBadge
      :color="color"
      variant="subtle"
      class="font-mono tabular-nums"
      :aria-label="`Average position ${val.toFixed(1)}, ${qualitative}`"
    >
      {{ formattedValue }}
    </UBadge>
    <template #text>
      <div class="max-w-xs text-xs">
        <p class="font-medium mb-1">
          Avg Position: {{ val.toFixed(1) }}
        </p>
        <p class="text-muted">
          Weighted average across all impressions (countries, devices, personalization). May differ from single SERP checks.
        </p>
      </div>
    </template>
  </UiTooltip>
</template>
