<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number
  variant?: 'default' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  /** Optional help tooltip — renders a (?) icon next to the label. */
  tooltip?: string
}>()

defineSlots<{
  value?: string | number
}>()
</script>

<template>
  <div class="flex flex-col">
    <div
      class="font-medium text-dimmed mb-1"
      :class="size === 'lg' ? 'text-sm' : 'text-xs'"
    >
      <UiHelpLabel v-if="tooltip" :text="label" :tooltip="tooltip" />
      <template v-else>
        {{ label }}
      </template>
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
      <slot name="value">
        {{ value }}
      </slot>
    </div>
  </div>
</template>
