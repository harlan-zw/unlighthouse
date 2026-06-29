<script setup lang="ts">
import { scanLinkPath } from '~/features/scan/scan-links'

// /sites/{slug}/scans/{id} → the live overview while the scan is still running,
// otherwise straight to the routes table. Probing scan.status keeps a deep-link
// to an in-progress scan on the ScanProgress view instead of an empty panel.
const route = useRoute()
const api = useApi()
const siteId = route.params.siteId as string
const scanId = route.params.scanId as string
const status = await api['scan.status']({ scanId: scanId as never }).then((r: any) => r?.status).catch(() => null)
await navigateTo(scanLinkPath(siteId, scanId, status), { replace: true })
</script>

<template>
  <div />
</template>
