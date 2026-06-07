<script lang="ts" setup>
import { computed } from 'vue'

type ProgressColor = 'error' | 'info' | 'primary' | 'neutral' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'pro'

const { total, value, tooltip, color = 'primary' } = defineProps<{
  total?: string | number
  value: string | number
  tooltip?: string
  color?: ProgressColor
}>()

const percentage = computed(() => {
  return (Number(value) / Number(total || 100)) * 100
})
</script>

<template>
  <UiTooltip :text="tooltip || `${percentage.toFixed(1)}% of clicks`" class="block w-full">
    <slot />
    <UProgress
      :model-value="percentage || 0"
      :color="color"
      :aria-label="tooltip || `${percentage.toFixed(1)}% of clicks`"
      class="opacity-90"
      size="xs"
      v-bind="$attrs"
    />
  </UiTooltip>
</template>
