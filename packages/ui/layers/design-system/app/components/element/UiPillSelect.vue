<script setup lang="ts" generic="T extends string | number">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

const props = defineProps<{
  options: { label: string, value: T }[]
}>()

const modelValue = defineModel<T>({ required: true })

// reka emits the value as a string (DOM attr round-trip). Map back to the
// original option so numeric `T` keeps its type, and swallow null (deselect).
function onUpdate(value: unknown) {
  if (typeof value !== 'string')
    return
  const match = props.options.find(o => String(o.value) === value)
  if (match)
    modelValue.value = match.value
}
</script>

<template>
  <ToggleGroupRoot
    :model-value="String(modelValue)"
    type="single"
    class="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-elevated border border-default/50"
    @update:model-value="onUpdate"
  >
    <ToggleGroupItem
      v-for="opt in props.options"
      :key="String(opt.value)"
      :value="String(opt.value)"
      class="px-2.5 py-1 text-xs font-medium rounded-md transition-[background-color,color,box-shadow] duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="[
        modelValue === opt.value
          ? 'bg-default text-default shadow-sm'
          : 'text-muted hover:text-default',
      ]"
    >
      {{ opt.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
