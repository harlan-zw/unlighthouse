<script setup lang="ts">
// Layout for scan result pages. The scan menus + scanned-routes list live in
// the sidebar (AppSidebar, context-aware); here we just provide the breadcrumb.
const route = useRoute()
const siteId = computed(() => (route.params.siteId as string) ?? '')
const scanId = computed(() => (route.params.scanId as string) ?? '')

// Bridge live scan events into the query cache for every scan page at once, so
// a scan completing refetches the mounted summary / results / meta queries.
useScanSubscription()
</script>

<template>
  <SidebarShell>
    <template #subnav>
      <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-sm min-w-0">
        <NuxtLink to="/" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors shrink-0 lg:min-h-6 lg:min-w-6">
          Sites
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <NuxtLink :to="`/sites/${siteId}`" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors truncate lg:min-h-6 lg:min-w-6">
          {{ siteId }}
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <span class="font-mono text-xs font-medium truncate">{{ scanId.slice(0, 8) }}</span>
      </nav>
    </template>

    <slot />
  </SidebarShell>
</template>
