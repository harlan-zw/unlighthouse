<script setup lang="ts">
defineProps<{
  value: {
    scoreDisplayMode?: string
    errorMessage?: string
    score: number
    details: {
      items: []
    }
  }
}>()
</script>

<template>
  <div>
    <AuditResult :value="{ score: value.score, displayValue: String(value.details.items.length) }" />
  </div>
</template>
