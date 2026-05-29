<script setup lang="ts">
import type { SemanticStatus } from '../../composables/semanticColors'

const { severity = 'neutral', label } = defineProps<{
  severity?: SemanticStatus
  label?: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs w-auto" :class="severity === 'error' ? semanticColors.error.text : severity === 'warning' ? semanticColors.warning.text : severity === 'neutral' ? semanticColors.neutral.text : 'text-default'">
    <span class="size-1.5 rounded-full shrink-0" :class="semanticColors[severity].dot" aria-hidden="true" />
    <slot>{{ label }}</slot>
  </span>
</template>
