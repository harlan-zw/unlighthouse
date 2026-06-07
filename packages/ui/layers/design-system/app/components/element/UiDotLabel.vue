<script setup lang="ts">
const { dotClass, dotSize = '1.5', label } = defineProps<{
  /** Tailwind bg class for the dot, e.g. 'bg-blue-500' or vizDotColor key result */
  dotClass: string
  /** Dot size token: '1.5' (default, inline/legend), '2' (medium), '2.5' (hero) */
  dotSize?: '1.5' | '2' | '2.5'
  /** Optional text label rendered after the dot */
  label?: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span class="rounded-full shrink-0" :class="[dotClass, `size-${dotSize}`]" aria-hidden="true" />
    <slot>
      <span v-if="label">{{ label }}</span>
    </slot>
  </span>
</template>
