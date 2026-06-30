<script setup lang="ts">
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { getScanId } from '~/features/scan/route-context'
import { scanLinkPath } from '~/features/scan/scan-links'

// Back-compat shim. Old bookmarks/CI links used /scan/{id}. The new tree
// nests scans under their site, so resolve the slug from scan.meta (the only
// place a scanId→site mapping lives) and redirect to the new overview.
const api = useApi()
const scanId = getScanId()

usePageTitle('Opening Scan')

try {
  const meta = await api['scan.meta']({ scanId })
  const slug = siteSlug(meta.site)
  const status = await api['scan.status']({ scanId }).then(r => r.status).catch((err) => {
    logOperationalWarn('ui.optional_api_read_failed', err, { command: 'scan.status', page: 'legacy-scan-redirect' }, console)
    return null
  })
  await navigateTo(scanLinkPath(slug, scanId, status), { replace: true })
}
catch (err) {
  logOperationalWarn('ui.optional_api_read_failed', err, { command: 'scan.meta', page: 'legacy-scan-redirect' }, console)
  await navigateTo('/history', { replace: true })
}
</script>

<template>
  <div class="flex items-center justify-center py-20 text-muted">
    <UiIcon name="loading" class="size-5 animate-spin mr-2" />
    Redirecting…
  </div>
</template>
