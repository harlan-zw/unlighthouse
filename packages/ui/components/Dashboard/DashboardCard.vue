<script setup lang="ts">
defineProps<{
  title: string
  count?: number
  icon?: string
  loading?: boolean
}>()
</script>

<template>
  <div class="bg-elevated/40 border border-default rounded-sm overflow-hidden">
    <div class="px-4 py-3 border-b border-default flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon v-if="icon" :name="icon" class="w-4 h-4 text-muted" />
        <h3 class="text-sm font-medium text-highlighted">{{ title }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
        <UBadge v-if="count !== undefined" color="neutral" variant="subtle" size="sm">
          {{ count }}
        </UBadge>
      </div>
    </div>
    <div v-if="loading" class="p-4">
      <div class="space-y-3">
        <USkeleton class="h-8 w-full" />
        <USkeleton class="h-8 w-full" />
        <USkeleton class="h-8 w-3/4" />
      </div>
    </div>
    <div v-else class="p-4">
      <slot />
    </div>
  </div>
</template>
