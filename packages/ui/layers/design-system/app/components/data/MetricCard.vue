<script setup lang="ts">
defineProps<{
  label: string
  value: string
  change?: number
  inverted?: boolean
  changeFormat?: 'number' | 'percent'
}>()
</script>

<template>
  <div class="p-3">
    <div class="text-label text-dimmed mb-1">
      {{ label }}
    </div>
    <div class="numerals-display text-base text-default">
      {{ value }}
    </div>
    <UiTrend
      v-if="change != null"
      :value="change"
      :inverted="inverted"
      :format="changeFormat || 'number'"
      show-sign
      size="2xs"
      class="mt-0.5"
    />
  </div>
</template>
