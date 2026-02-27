<script setup lang="ts">
defineProps<{
  severity: string
}>()

const severityStyles: Record<string, { bg: string, text: string, label: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Critical' },
  serious: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Serious' },
  moderate: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Moderate' },
  minor: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'Minor' },
  high: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'High' },
  medium: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Medium' },
  low: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Low' },
}

function getStyle(sev: string) {
  return severityStyles[sev.toLowerCase()] ?? severityStyles.minor
}
</script>

<template>
  <span
    class="text-xs px-2 py-0.5 rounded border"
    :class="[
      getStyle(severity).bg,
      getStyle(severity).text,
      `border-${getStyle(severity).text.replace('text-', '')}/20`,
    ]"
  >
    {{ getStyle(severity).label }}
  </span>
</template>
