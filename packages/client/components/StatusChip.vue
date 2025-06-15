<script setup lang="ts">
defineProps<{
  variant: 'error' | 'warning' | 'info' | 'success'
  size?: 'sm' | 'md'
}>()

const variantClasses = {
  error: 'bg-red-300 text-red-700',
  warning: 'bg-yellow-300 text-yellow-700 border-yellow-600 border-2',
  info: 'bg-blue-300 text-info',
  success: 'bg-green-300 text-success',
}
</script>

<template>
  <div
    class="chip-base"
    :class="[
      variantClasses[variant],
      size === 'md' ? 'padding-sm' : '',
    ]"
  >
    <slot />
  </div>
</template>
