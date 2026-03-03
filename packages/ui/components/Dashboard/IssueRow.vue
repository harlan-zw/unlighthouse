<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  severity?: string
  count?: number
  pages?: string[]
}>()

const expanded = ref(false)
</script>

<template>
  <div class="border-b border-white/5 last:border-0">
    <button
      class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <UIcon
          :name="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="w-4 h-4 text-gray-500 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="text-sm text-white truncate">{{ title }}</div>
          <div v-if="description" class="text-xs text-gray-500 truncate mt-0.5">{{ description }}</div>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <DashboardSeverityBadge v-if="severity" :severity="severity" />
        <span v-if="count" class="text-xs text-gray-400 font-mono">{{ count }} pages</span>
      </div>
    </button>
    <div v-if="expanded && pages?.length" class="px-4 pb-3 pl-11">
      <DashboardPagesList :pages="pages" />
    </div>
  </div>
</template>
