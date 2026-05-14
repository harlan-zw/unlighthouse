<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{
  options: { label: string, value: T }[]
}>()

const modelValue = defineModel<T>({ required: true })
</script>

<template>
  <div class="inline-flex items-center gap-0.5 p-0.5 rounded-sm bg-elevated border border-default/50">
    <button
      v-for="opt in props.options"
      :key="opt.value"
      class="px-2.5 py-1 text-xs font-medium rounded-md transition-[background-color,color,box-shadow] duration-200"
      :class="[
        modelValue === opt.value
          ? 'bg-default text-default shadow-sm'
          : 'text-muted hover:text-default',
      ]"
      @click="modelValue = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
