<script setup lang="ts" generic="T">
import type { Header } from '@tanstack/vue-table'
import { FlexRender } from '@tanstack/vue-table'

const { header, sortDirection } = defineProps<{
  header: Header<T, unknown>
  sortDirection: 'asc' | 'desc' | false
}>()

const emit = defineEmits<{ sort: [columnId: string] }>()

const def = computed(() => header.column.columnDef)
const sortable = computed(() => header.column.getCanSort())

const justifyClass = computed(() => {
  if (def.value.align === 'center')
    return 'justify-center'
  if (def.value.align === 'right')
    return 'justify-end'
  return 'justify-start'
})

const isHeaderEmpty = computed(() => {
  const v = def.value.header
  return v === '' || v == null
})

const sortIcon = computed(() => {
  if (sortDirection)
    return 'i-lucide-chevron-up'
  return 'i-lucide-chevrons-up-down'
})

// Chevron rotates 180° between asc/desc — a single icon animates rather than swapping.
const sortIconRotate = computed(() => sortDirection === 'desc' ? 'rotate-180' : '')

const buttonClass = 'flex items-center gap-1 w-full text-[11px] font-semibold uppercase tracking-[0.08em] cursor-pointer select-none transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
</script>

<template>
  <UiTooltip v-if="def.tooltip" :text="def.tooltip">
    <button
      v-if="sortable"
      type="button"
      :class="[buttonClass, justifyClass, sortDirection ? 'text-highlighted' : 'text-muted hover:text-default']"
      :aria-label="isHeaderEmpty ? `Sort by ${header.column.id}` : undefined"
      @click.stop="emit('sort', header.column.id)"
    >
      <FlexRender v-if="!header.isPlaceholder" :render="def.header" :props="header.getContext()" />
      <UIcon :name="sortIcon" class="size-3 text-dimmed transition-transform duration-150" :class="sortIconRotate" aria-hidden="true" />
    </button>
    <div v-else class="flex items-center gap-1" :class="justifyClass">
      <FlexRender v-if="!header.isPlaceholder" :render="def.header" :props="header.getContext()" />
    </div>
  </UiTooltip>
  <button
    v-else-if="sortable"
    type="button"
    :class="[buttonClass, justifyClass, sortDirection ? 'text-highlighted' : 'text-muted hover:text-default']"
    :aria-label="isHeaderEmpty ? `Sort by ${header.column.id}` : undefined"
    @click.stop="emit('sort', header.column.id)"
  >
    <FlexRender v-if="!header.isPlaceholder" :render="def.header" :props="header.getContext()" />
    <UIcon :name="sortIcon" class="size-3 text-dimmed transition-transform duration-150" :class="sortIconRotate" aria-hidden="true" />
  </button>
  <div v-else class="flex items-center gap-1" :class="justifyClass">
    <FlexRender v-if="!header.isPlaceholder" :render="def.header" :props="header.getContext()" />
  </div>
</template>
