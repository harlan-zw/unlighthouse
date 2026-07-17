<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const { label } = defineProps<{
  label?: string
}>()

const open = defineModel<boolean>('open', { default: false })

function onToggle(event: Event) {
  open.value = (event.currentTarget as HTMLDetailsElement).open
}
</script>

<template>
  <details
    v-bind="$attrs"
    class="ui-disclosure group"
    :open="open"
    @toggle="onToggle"
  >
    <summary class="flex items-center gap-2 w-full text-sm py-1 cursor-pointer list-none">
      <UiIcon name="chevron-right" class="size-4 text-muted transition-transform group-open:rotate-90" />
      <slot name="summary" :open="open">
        <span class="font-medium">{{ label }}</span>
      </slot>
    </summary>
    <slot />
  </details>
</template>
