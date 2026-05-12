<script setup lang="ts">
const props = defineProps<{
  severity: 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | string
}>()

const config = computed(() => {
  switch (props.severity) {
    case 'critical':
    case 'serious':
      return { bg: 'bg-error/10', text: 'text-error', border: 'border-error/20' }
    case 'moderate':
      return { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20' }
    case 'minor':
    case 'info':
    default:
      return { bg: 'bg-info/10', text: 'text-info', border: 'border-info/20' }
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
