<script setup lang="ts">
const props = defineProps<{
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
    <audit-result :value="{ score: value.score, displayValue: value.details.items.length }" />
  </div>
</template>
