<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

export interface MetricToggleOption {
  key: string
  label: string
  color: string
  icon?: string
  tooltip?: string
  special?: boolean
}

const { options, iconOnly = false } = defineProps<{
  options: MetricToggleOption[]
  /** Render icons only (no labels) in a tighter bordered segment. Label moves to a tooltip/aria. */
  iconOnly?: boolean
}>()

const emit = defineEmits<{
  toggle: [key: string]
}>()

const modelValue = defineModel<string[]>({ required: true })

function onUpdate(value: unknown) {
  const next = Array.isArray(value) ? value.filter(v => typeof v === 'string') : []
  // Surface the single key that flipped so consumers can react per-metric.
  const changed = next.find(k => !modelValue.value.includes(k))
    ?? modelValue.value.find(k => !next.includes(k))
  if (changed)
    emit('toggle', changed)
  modelValue.value = next
}

function isActive(key: string) {
  return modelValue.value.includes(key)
}
</script>

<template>
  <ToggleGroupRoot
    :model-value="modelValue"
    type="multiple"
    :class="iconOnly ? 'flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--ui-bg-elevated)]/60 border border-default' : 'flex gap-1'"
    @update:model-value="onUpdate"
  >
    <ToggleGroupItem
      v-for="opt in options"
      :key="opt.key"
      :value="opt.key"
      :title="iconOnly ? opt.label : undefined"
      class="cursor-pointer inline-flex items-center font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="[
        iconOnly ? 'justify-center size-7 rounded-md' : 'gap-1.5 px-2 py-1 text-mini rounded-md border',
        isActive(opt.key)
          ? (iconOnly ? 'bg-default text-default shadow-sm' : 'border-accented bg-elevated text-default')
          : (iconOnly ? 'text-dimmed hover:text-default' : 'border-transparent text-dimmed hover:text-muted hover:bg-accented'),
        opt.special && !isActive(opt.key) && 'ring-1 ring-[var(--ui-primary)]/50',
      ]"
      :aria-label="`Toggle ${opt.label}`"
    >
      <UiIcon v-if="opt.icon" :name="opt.icon" class="size-3.5" />
      <span
        v-else
        class="size-1.5 rounded-full shrink-0 transition-colors duration-150"
        :class="isActive(opt.key) ? vizBgColor(opt.color) : 'bg-muted'"
      />
      <template v-if="!iconOnly">
        {{ opt.label }}
      </template>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
