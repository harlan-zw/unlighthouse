<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  variant?: 'default' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <div class="flex flex-col">
    <div
      class="text-xs font-medium text-subtle mb-1"
      :class="size === 'lg' ? 'text-sm' : 'text-xs'"
    >
      {{ label }}
    </div>
    <div
      class="font-medium"
      :class="[
        size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-base',
        variant === 'success' ? 'text-success'
        : variant === 'warning' ? 'text-warning'
          : variant === 'error' ? 'text-error'
            : 'text-muted',
      ]"
    >
      {{ value }}
    </div>
  </div>
</template>
