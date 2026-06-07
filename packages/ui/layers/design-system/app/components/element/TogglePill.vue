<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

export interface TogglePillOption {
  value: string
  label: string
  icon?: string
  disabled?: boolean
  tooltip?: string
}

const { options } = defineProps<{
  options: TogglePillOption[]
}>()

const modelValue = defineModel<string>({ required: true })

// reka ToggleGroup (type=single) emits `null` when the active item is pressed
// again. This pill is a required single-select, so swallow the deselect.
function onUpdate(value: unknown) {
  if (typeof value === 'string' && value)
    modelValue.value = value
}

const itemClass = 'px-2.5 py-1 text-mini font-medium rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary'
</script>

<template>
  <ToggleGroupRoot
    :model-value="modelValue"
    type="single"
    class="flex rounded-lg bg-muted p-0.5"
    @update:model-value="onUpdate"
  >
    <template v-for="opt in options" :key="opt.value">
      <UiTooltip v-if="opt.tooltip" :text="opt.tooltip" :delay-duration="200">
        <ToggleGroupItem
          :value="opt.value"
          :disabled="opt.disabled"
          class="data-disabled:text-dimmed/60 data-disabled:cursor-not-allowed cursor-pointer"
          :class="[
            itemClass,
            modelValue === opt.value
              ? 'bg-elevated text-default'
              : 'text-dimmed hover:text-muted',
          ]"
        >
          <UiIcon v-if="opt.icon" :name="opt.icon" class="size-3.5 mr-1" />
          {{ opt.label }}
        </ToggleGroupItem>
      </UiTooltip>
      <ToggleGroupItem
        v-else
        :value="opt.value"
        :disabled="opt.disabled"
        class="data-disabled:text-dimmed/60 data-disabled:cursor-not-allowed cursor-pointer"
        :class="[
          itemClass,
          modelValue === opt.value
            ? 'bg-elevated text-default'
            : 'text-dimmed hover:text-muted',
        ]"
      >
        <UiIcon v-if="opt.icon" :name="opt.icon" class="size-3.5 mr-1" />
        {{ opt.label }}
      </ToggleGroupItem>
    </template>
  </ToggleGroupRoot>
</template>
