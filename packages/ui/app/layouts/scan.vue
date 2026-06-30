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
      <nav class="flex items-center gap-1.5 text-sm min-w-0">
        <NuxtLink to="/sites" class="text-muted hover:text-default transition-colors shrink-0">
          Sites
        </NuxtLink>
        <Icon name="lucide:chevron-right" class="size-3.5 text-muted shrink-0" />
        <NuxtLink :to="`/sites/${siteId}`" class="text-muted hover:text-default transition-colors truncate">
          {{ siteId }}
        </NuxtLink>
        <Icon name="lucide:chevron-right" class="size-3.5 text-muted shrink-0" />
        <span class="font-mono text-xs font-medium truncate">{{ scanId.slice(0, 8) }}</span>
      </nav>
    </template>

    <slot />
  </SidebarShell>
</template>
