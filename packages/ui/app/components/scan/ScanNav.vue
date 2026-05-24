<script setup lang="ts">
const route = useRoute()
const scanId = computed(() => route.params.id as string)

const currentPath = computed(() => {
  const full = route.path
  const prefix = `/scan/${scanId.value}/`
  if (!full.startsWith(prefix)) return 'overview'
  const rest = full.slice(prefix.length).split('/')[0]
  return rest || 'overview'
})

const pageLabels: Record<string, string> = {
  'performance': 'Performance',
  'seo': 'SEO',
  'accessibility': 'Accessibility',
  'best-practices': 'Best Practices',
  'agentic-browsing': 'Agentic Browsing',
  'crux': 'CrUX',
  'routes': 'Routes',
  'compare': 'Compare',
  'events': 'Events',
}

const pageLabel = computed(() => pageLabels[currentPath.value] || currentPath.value)
const isOverview = computed(() => currentPath.value === 'overview')
</script>

<template>
  <nav v-if="!isOverview" class="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
    <NuxtLink
      :to="`/scan/${scanId}/overview`"
      class="hover:text-foreground transition-colors"
    >
      Overview
    </NuxtLink>
    <Icon name="lucide:chevron-right" class="size-3.5" />
    <span class="text-foreground font-medium">{{ pageLabel }}</span>
  </nav>
</template>
