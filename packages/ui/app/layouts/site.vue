<script setup lang="ts">
// Layout for /sites/{slug}. Shares the sidebar shell; the #subnav shows a
// Sites › {slug} breadcrumb. The page itself owns the detail content.
const route = useRoute()
const slug = computed(() => route.params.siteId as string)
</script>

<template>
  <SidebarShell>
    <template #subnav>
      <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-sm min-w-0">
        <NuxtLink to="/" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors shrink-0 lg:min-h-6 lg:min-w-6">
          Sites
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <span class="font-medium truncate">{{ slug }}</span>
      </nav>
    </template>
    <slot />
  </SidebarShell>
</template>
