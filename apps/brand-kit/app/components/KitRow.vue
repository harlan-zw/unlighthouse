<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
    <div class="text-xs uppercase tracking-wider text-dimmed font-medium sm:w-40 shrink-0">
      {{ label }}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>
