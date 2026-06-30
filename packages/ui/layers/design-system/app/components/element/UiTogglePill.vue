<script setup lang="ts" generic="T extends string | number = string">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

export interface TogglePillOption<T extends string | number = string> {
  value: T
  label: string
  icon?: string
  disabled?: boolean
  tooltip?: string
}

export interface UiTogglePillProps<T extends string | number = string> {
  options: TogglePillOption<T>[]
  /** Accessible name for the segmented control (screen-reader only). */
  label?: string
}

const { options, label } = defineProps<UiTogglePillProps<T>>()

const modelValue = defineModel<T>({ required: true })

// reka ToggleGroup (type=single) round-trips the value through a DOM attr, so
// it always emits a string; map back to the original option so a numeric `T`
// keeps its type. `null`/deselect is swallowed — this is a required single-select.
function onUpdate(value: unknown) {
  if (typeof value !== 'string')
    return
  const match = options.find(o => String(o.value) === value)
  if (match)
    modelValue.value = match.value
}

const itemClass = 'px-2.5 py-1 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center text-mini font-medium rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary'
</script>

<template>
  <ToggleGroupRoot
    :model-value="String(modelValue)"
    type="single"
    :aria-label="label"
    class="flex rounded-lg bg-muted p-0.5"
    @update:model-value="onUpdate"
  >
    <template v-for="opt in options" :key="String(opt.value)">
      <UiTooltip v-if="opt.tooltip" :text="opt.tooltip" :delay-duration="200">
        <ToggleGroupItem
          :value="String(opt.value)"
          :disabled="opt.disabled"
          class="data-disabled:text-dimmed/60 data-disabled:cursor-not-allowed cursor-pointer"
          :class="[
            itemClass,
            modelValue === opt.value
              ? 'bg-elevated text-default'
              : 'text-dimmed hover:text-muted',
          ]"
        >
          <UiIcon v-if="opt.icon" :name="opt.icon" class="size-3.5 mr-1" aria-hidden="true" />
          {{ opt.label }}
        </ToggleGroupItem>
      </UiTooltip>
      <ToggleGroupItem
        v-else
        :value="String(opt.value)"
        :disabled="opt.disabled"
        class="data-disabled:text-dimmed/60 data-disabled:cursor-not-allowed cursor-pointer"
        :class="[
          itemClass,
          modelValue === opt.value
            ? 'bg-elevated text-default'
            : 'text-dimmed hover:text-muted',
        ]"
      >
        <UiIcon v-if="opt.icon" :name="opt.icon" class="size-3.5 mr-1" aria-hidden="true" />
        {{ opt.label }}
      </ToggleGroupItem>
    </template>
  </ToggleGroupRoot>
</template>
