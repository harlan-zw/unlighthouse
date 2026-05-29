<script setup lang="ts">
// Layout for the scan result pages. Shares the sidebar shell; the #subnav
// shows a Scans › {id} breadcrumb and the ScanTabs bar sits atop the content.
const route = useRoute()
const scanId = computed(() => route.params.id as string)
</script>

<template>
  <SidebarShell>
    <template #subnav>
      <nav class="flex items-center gap-1.5 text-sm min-w-0">
        <NuxtLink to="/history" class="text-muted-foreground hover:text-foreground transition-colors shrink-0">
          Scans
        </NuxtLink>
        <Icon name="lucide:chevron-right" class="size-3.5 text-muted-foreground shrink-0" />
        <span class="font-mono text-xs font-medium truncate">{{ scanId.slice(0, 8) }}</span>
      </nav>
    </template>

    <div class="space-y-6">
      <ScanTabs />
      <slot />
    </div>
  </SidebarShell>
</template>
