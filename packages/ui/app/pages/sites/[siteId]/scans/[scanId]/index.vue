<script setup lang="ts">
import { scanLinkPath } from '~/features/scan/scan-links'

// /sites/{slug}/scans/{id} always lands on the overview tab (D-049): a single
// scan landing regardless of status, so this is an unconditional redirect —
// no `scan.status` probe needed.
const route = useRoute()
const siteId = route.params.siteId as string
const scanId = route.params.scanId as string

useScanPageTitle('Opening Scan')

await navigateTo(scanLinkPath(siteId, scanId), { replace: true })
</script>

<template>
  <div />
</template>
