<script setup lang="ts">
// Back-compat shim. Old bookmarks/CI links used /scan/{id}. The new tree
// nests scans under their site, so resolve the slug from scan.meta (the only
// place a scanId→site mapping lives) and redirect to the new overview.
const route = useRoute()
const api = useApi()
const scanId = route.params.id as string

try {
  const meta = await api['scan.meta']({ scanId })
  const slug = new URL(meta.site).hostname
  await navigateTo(`/sites/${slug}/scans/${scanId}/overview`, { replace: true })
}
catch {
  await navigateTo('/history', { replace: true })
}
</script>

<template>
  <div class="flex items-center justify-center py-20 text-muted-foreground">
    <Icon name="lucide:loader-2" class="size-5 animate-spin mr-2" />
    Redirecting…
  </div>
</template>
