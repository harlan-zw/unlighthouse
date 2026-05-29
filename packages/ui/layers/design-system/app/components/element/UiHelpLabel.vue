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
  <UiTooltip :title="tooltipTitle || text" :description="tooltip">
    <span class="inline-flex items-center gap-1">
      {{ text }}
      <UiIcon name="i-lucide-circle-help" class="size-3 opacity-50 shrink-0" aria-hidden="true" />
      <!-- The tooltip primitive only opens on hover, so mirror the help text
           into the accessibility tree for keyboard / screen-reader users. -->
      <span class="sr-only">{{ tooltip }}</span>
    </span>
  </UiTooltip>
</template>
