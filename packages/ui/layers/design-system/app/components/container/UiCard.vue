<script setup lang="ts">
const {
  size = 'md',
} = defineProps<{
  title?: string
  description?: string
  divided?: boolean
  /** 'default' = solid bg-elevated (forms, settings). 'subtle' = translucent bg (data displays, lists). */
  variant?: 'default' | 'subtle'
  /** 'xs' = tight (inline/nested). 'sm' = compact (lists, dense tables). 'md' = default. 'lg' = spacious (hero/feature cards). */
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>()

const slots = defineSlots<{
  default?: () => any
  header?: () => any
  actions?: () => any
}>()

const headerClass = {
  xs: 'px-2.5 py-2',
  sm: 'px-3 sm:px-4 py-3',
  md: 'px-4 sm:px-6 py-4',
  lg: 'px-6 sm:px-8 py-5',
}[size]

const bodyClass = {
  xs: 'p-2.5',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-6',
  lg: 'p-6 sm:p-8',
}[size]

const bodyDividedClass = {
  xs: 'divide-y divide-[var(--ui-border)] [&>*]:p-2.5',
  sm: 'divide-y divide-[var(--ui-border)] [&>*]:p-3 [&>*]:sm:p-4',
  md: 'divide-y divide-[var(--ui-border)] [&>*]:p-4 [&>*]:sm:p-6',
  lg: 'divide-y divide-[var(--ui-border)] [&>*]:p-6 [&>*]:sm:p-8',
}[size]

// Size stays driven by the card's `size` prop (not the theme-resizing role
// tokens); only the weight routes through the .font-strong token so it tunes
// centrally with the rest of the type system.
const titleClass = {
  xs: 'text-xs font-strong text-default',
  sm: 'text-sm font-strong text-default',
  md: 'font-strong text-default',
  lg: 'text-lg font-strong text-default',
}[size]
</script>

<template>
  <div class="flex flex-col">
    <div
      class="relative overflow-hidden rounded-xl border border-default flex flex-col flex-1"
      :class="[
        variant === 'subtle' ? 'bg-[var(--ui-bg-elevated)]/5' : 'bg-[var(--ui-bg-elevated)]/35',
      ]"
    >
      <!-- Header slot -->
      <div v-if="slots.header" class="relative border-b border-default shrink-0" :class="headerClass">
        <slot name="header" />
      </div>
      <!-- Auto header from title/description -->
      <div v-else-if="title || slots.actions" class="relative border-b border-default shrink-0 flex items-start justify-between gap-3" :class="headerClass">
        <div class="min-w-0">
          <h3 v-if="title" :class="titleClass">
            {{ title }}
          </h3>
          <p v-if="description" class="text-sm text-muted mt-1">
            {{ description }}
          </p>
        </div>
        <div v-if="slots.actions" class="flex items-center gap-2 shrink-0">
          <slot name="actions" />
        </div>
      </div>

      <div
        data-card-body class="relative flex-1 flex flex-col"
        :class="[divided ? bodyDividedClass : bodyClass]"
      >
        <slot />
      </div>
    </div>
  </div>
</template>
