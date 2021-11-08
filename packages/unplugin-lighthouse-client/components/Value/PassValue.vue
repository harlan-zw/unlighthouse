<script setup lang="ts">
const props = defineProps<{
  pass: boolean
}>()
</script>
<template>
<div class="flex items-center">
  <div class="mr-1">
  <i-carbon-checkmark-outline v-if="pass" class="text-green-500" />
  <i-carbon-close-outline v-else class="text-red-500" />
  </div>
  <slot></slot>
</div>
</template>
