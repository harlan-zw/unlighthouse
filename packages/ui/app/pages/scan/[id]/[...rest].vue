<script setup lang="ts">
import { getScanId } from '~/features/scan/route-context'

// Back-compat shim for deep links: old /scan/{id}/{sub} → new tree.
// `compare` is the exception — it's a standalone full-bleed page at /compare.
const route = useRoute()
const api = useApi()
const scanId = getScanId()
const rest = route.params.rest
const restPath = Array.isArray(rest) ? rest.join('/') : (rest as string)

usePageTitle('Opening Scan')

if (restPath.startsWith('compare')) {
  await navigateTo(`/compare/${scanId}`, { replace: true })
}
else {
  try {
    const meta = await api['scan.meta']({ scanId })
    const slug = siteSlug(meta.site)
    await navigateTo(`/sites/${slug}/scans/${scanId}/${restPath}`, { replace: true })
  }
  catch (_err) {
    // Legacy deep-link metadata lookup failed; fall back to the history page.
    await navigateTo('/history', { replace: true })
  }
}
</script>

<template>
  <div class="flex items-center justify-center py-20 text-muted">
    <UiIcon name="loading" class="size-5 animate-spin mr-2" />
    Redirecting…
  </div>
</template>
