<script setup lang="ts">
const props = defineProps<{
  pages: string[]
  limit?: number
}>()

const expanded = ref(false)
const displayLimit = computed(() => props.limit ?? 5)
const visiblePages = computed(() =>
  expanded.value ? props.pages : props.pages.slice(0, displayLimit.value),
)
const hasMore = computed(() => props.pages.length > displayLimit.value)
</script>

<template>
  <div class="space-y-1">
    <NuxtLink
      v-for="page in visiblePages"
      :key="page"
      :to="`/results?path=${encodeURIComponent(page)}`"
      class="block text-xs font-mono text-gray-400 hover:text-white transition-colors truncate"
    >
      {{ page }}
    </NuxtLink>
    <button
      v-if="hasMore"
      class="text-xs text-amber-400 hover:text-amber-300 transition-colors"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show less' : `+${pages.length - displayLimit} more` }}
    </button>
  </div>
</template>
