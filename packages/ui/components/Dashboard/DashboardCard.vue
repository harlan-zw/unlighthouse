<script setup lang="ts">
defineProps<{
  title: string
  count?: number
  icon?: string
  loading?: boolean
}>()
</script>

<template>
  <div class="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
    <div class="px-4 py-3 border-b border-white/5 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon v-if="icon" :name="icon" class="w-4 h-4 text-gray-400" />
        <h3 class="text-sm font-medium text-white">{{ title }}</h3>
      </div>
      <UBadge v-if="count !== undefined" color="neutral" variant="subtle" size="sm">
        {{ count }}
      </UBadge>
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
