<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = defineProps<{ [key: string]: any }>()
</script>

<template>
  <UiTableScoreTile v-bind="{ ...props, ...$attrs } as any">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </UiTableScoreTile>
</template>
