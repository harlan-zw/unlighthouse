<script setup lang="ts">
const props = defineProps<{
  value: {
    score: number
    details: {
      items: []
    }
  }
}>()
</script>
<template>
  <audit-result :value="{ score: value.score, displayValue: value.details.items.length }" />
</template>
