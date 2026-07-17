<script lang="ts" setup>
import { computed } from 'vue'

// A %-of-total viz bar — brand-colored by default. Constrained to the
// SemanticStatus set + `primary` (the design-system palette); the older
// `secondary`/`tertiary`/`pro` Nuxt UI aliases were never used by a caller.
type ProgressColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

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
  <UiTooltip :text="tooltip || `${percentage.toFixed(1)}% of clicks`" trigger-as="child">
    <div
      class="block w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      role="img"
      tabindex="0"
      :aria-label="tooltip || `${percentage.toFixed(1)}% of clicks`"
    >
      <slot />
      <UProgress
        :model-value="percentage || 0"
        :color="color"
        aria-hidden="true"
        class="opacity-90"
        size="xs"
        v-bind="$attrs"
      />
    </div>
  </UiTooltip>
</template>
