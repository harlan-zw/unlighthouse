<script setup lang="ts">
const {
  size = 'md',
  rowHover = false,
  bordered = false,
  label,
} = defineProps<{
  size?: 'xs' | 'sm' | 'md'
  /** Enable hover gradient on body rows. */
  rowHover?: boolean
  /** Wrap the table in a bordered/rounded container (use false when caller owns the chrome). */
  bordered?: boolean
  /** Accessible name for the table. Rendered as a visually-hidden <caption>. */
  label?: string
}>()
</script>

<template>
  <div data-ui="UiTableShell" :class="bordered ? 'rounded-xl border border-default overflow-hidden bg-default' : ''">
    <table class="w-full" :data-size="size">
      <caption v-if="label" class="sr-only">
        {{ label }}
      </caption>
      <thead v-if="$slots.head" class="sticky top-0 z-10 bg-default">
        <tr class="h-10">
          <slot name="head" />
        </tr>
      </thead>
      <tbody :class="{ 'hover-rows': rowHover }">
        <tr class="spacer" aria-hidden="true" />
        <slot />
      </tbody>
      <slot name="tfoot" />
    </table>
  </div>
</template>

<style scoped>
tr.spacer {
  height: 0.25rem;
}
tbody tr:first-child :deep(td) {
  border-top: 4px solid transparent;
  background-clip: padding-box;
}
tbody.hover-rows tr:hover :deep(td:first-child) {
  background-color: color-mix(in srgb, var(--ui-bg-accented) 30%, transparent);
  border-top-left-radius: 0.5rem;
  border-bottom-left-radius: 0.5rem;
}
tbody.hover-rows tr:hover :deep(td:not(:first-child):not(:last-child)) {
  background-color: color-mix(in srgb, var(--ui-bg-accented) 30%, transparent);
}
tbody.hover-rows tr:hover :deep(td:last-child) {
  background-color: color-mix(in srgb, var(--ui-bg-accented) 30%, transparent);
  border-top-right-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}
tbody.hover-rows tr {
  transition: background-color 100ms;
}
tbody.hover-rows tr :deep(td) {
  transition: background-color 100ms;
}
</style>
