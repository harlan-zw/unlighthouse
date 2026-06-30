<script setup lang="ts">
import type { ScanId } from '@unlighthouse/contracts'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { scanLinkPath } from '~/features/scan/scan-links'

// /sites/{slug}/scans/{id} → the live overview while the scan is still running,
// otherwise straight to the routes table. Probing scan.status keeps a deep-link
// to an in-progress scan on the ScanProgress view instead of an empty panel.
const route = useRoute()
const api = useApi()
const siteId = route.params.siteId as string
const scanId = route.params.scanId as string

useScanPageTitle('Opening Scan')

const status = await api['scan.status']({ scanId: scanId as ScanId }).then(r => r.status).catch((err) => {
  logOperationalWarn('ui.optional_api_read_failed', err, { command: 'scan.status', page: 'scan-redirect' }, console)
  return null
})
await navigateTo(scanLinkPath(siteId, scanId, status), { replace: true })
</script>

<template>
  <div />
</template>
