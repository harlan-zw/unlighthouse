<script setup lang="ts">
const props = defineProps<{
  severity: 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | string
}>()

const config = computed(() => {
  switch (props.severity) {
    case 'critical':
      return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' }
    case 'serious':
      return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' }
    case 'moderate':
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' }
    case 'minor':
      return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' }
    default:
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' }
  }
})
</script>

<template>
  <span
    class="px-2 py-0.5 text-xs font-medium rounded border capitalize"
    :class="[config.bg, config.text, config.border]"
  >
    {{ severity }}
  </span>
</template>
