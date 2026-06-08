<script setup lang="ts">
// Back-compat shim for deep links: old /scan/{id}/{sub} → new tree.
// `compare` is the exception — it's a standalone full-bleed page at /compare.
const route = useRoute()
const api = useApi()
const scanId = route.params.id as string
const rest = route.params.rest
const restPath = Array.isArray(rest) ? rest.join('/') : (rest as string)

if (restPath.startsWith('compare')) {
  await navigateTo(`/compare/${scanId}`, { replace: true })
}
else {
  try {
    const meta = await api['scan.meta']({ scanId })
    const slug = new URL(meta.site).hostname
    await navigateTo(`/sites/${slug}/scans/${scanId}/${restPath}`, { replace: true })
  }
  catch {
    await navigateTo('/history', { replace: true })
  }
}
</script>

<template>
  <div class="flex items-center justify-center py-20 text-muted">
    <Icon name="lucide:loader-2" class="size-5 animate-spin mr-2" />
    Redirecting…
  </div>
</template>
