<script setup lang="ts">
// The scan sub-navigation tab bar (replaces the old ScanNav breadcrumb).
// Lives in the scan layout; reads the scanId + active segment from the route.
const route = useRoute()
const scanId = computed(() => route.params.id as string)

const current = computed(() => {
  const prefix = `/scan/${scanId.value}/`
  if (!route.path.startsWith(prefix))
    return 'overview'
  // /scan/{id}/route/{path} highlights the Routes tab.
  const seg = route.path.slice(prefix.length).split('/')[0] || 'overview'
  return seg === 'route' ? 'routes' : seg
})

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'routes', label: 'Routes' },
  { key: 'performance', label: 'Performance' },
  { key: 'seo', label: 'SEO' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'best-practices', label: 'Best Practices' },
  { key: 'crux', label: 'CrUX' },
  { key: 'events', label: 'Events' },
  { key: 'compare', label: 'Compare' },
]
</script>

<template>
  <nav class="flex items-center gap-1 border-b overflow-x-auto -mb-px">
    <NuxtLink
      v-for="t in tabs"
      :key="t.key"
      :to="`/scan/${scanId}/${t.key}`"
      class="px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors"
      :class="current === t.key
        ? 'border-primary text-foreground font-medium'
        : 'border-transparent text-muted-foreground hover:text-foreground'"
    >
      {{ t.label }}
    </NuxtLink>
  </nav>
</template>
