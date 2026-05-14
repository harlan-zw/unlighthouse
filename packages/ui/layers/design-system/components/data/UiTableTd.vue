<script setup lang="ts">
const {
  align = 'left',
  size = 'md',
  noPadding = false,
} = defineProps<{
  align?: 'left' | 'center' | 'right'
  size?: 'xs' | 'sm' | 'md'
  noPadding?: boolean
}>()

const sizes = {
  xs: 'py-1 h-8',
  sm: 'py-1 h-10',
  md: 'py-2 h-10',
} as const

const textAlign = computed(() => align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')
const padClass = computed(() => noPadding ? '' : 'px-3')
</script>

<template>
  <td
    class="text-xs font-normal text-default relative"
    :class="[sizes[size], padClass, textAlign]"
  >
    <slot />
  </td>
</template>
