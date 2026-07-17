<script setup lang="ts">
/**
 * UiHelpLabel
 *
 * Label text with an inline (?) help icon that shows a tooltip on hover.
 * Used by UiStat, ProDataList, and anywhere a title needs contextual help.
 */
const { text, tooltip, tooltipTitle } = defineProps<{
  text: string
  tooltip: string
  /** Bold title in tooltip panel. Defaults to `text`. */
  tooltipTitle?: string
}>()
</script>

<template>
  <UiTooltip :label="text" :title="tooltipTitle || text" :description="tooltip" />
</template>
