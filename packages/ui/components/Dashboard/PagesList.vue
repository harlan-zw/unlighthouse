<script setup lang="ts">
const props = defineProps<{
  pages: string[]
  limit?: number
}>()

const expanded = ref(false)
const displayLimit = computed(() => props.limit ?? 5)

const visiblePages = computed(() => {
  if (expanded.value) return props.pages
  return props.pages.slice(0, displayLimit.value)
})

const hasMore = computed(() => props.pages.length > displayLimit.value)
</script>

<template>
  <div class="text-xs">
    <div class="flex flex-wrap gap-1.5">
      <NuxtLink
        v-for="page in visiblePages"
        :key="page"
        :to="`?path=${encodeURIComponent(page)}`"
        class="px-2 py-1 rounded bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors font-mono truncate max-w-[200px]"
      >
        {{ page }}
      </NuxtLink>
    </div>
    <button
      v-if="hasMore"
      class="mt-2 text-gray-500 hover:text-white transition-colors"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show less' : `Show ${pages.length - displayLimit} more...` }}
    </button>
  </div>
</template>
