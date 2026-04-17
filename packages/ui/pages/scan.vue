<script setup lang="ts">
import { isActiveScanStatus } from '~/composables/scan'
import { apiUrl } from '~/composables/unlighthouse'

const [history, currentScan, scanStatus] = await Promise.all([
  $fetch<{ scans: { id: string }[] }>(`${apiUrl.value}/history`).catch(() => null),
  $fetch<{ scanId: string | null }>(`${apiUrl.value}/current-scan-id`).catch(() => null),
  $fetch<{ status: string, paused: boolean }>(`${apiUrl.value}/scan/status`).catch(() => null),
])

const hasActiveScan = !!currentScan?.scanId
  && isActiveScanStatus(scanStatus?.status, scanStatus?.paused)

if (hasActiveScan) {
  await navigateTo(`/results/${currentScan.scanId}/scan`, { replace: true })
}
else if (!history?.scans?.length) {
  await navigateTo('/onboarding', { replace: true })
}
else {
  await navigateTo('/history', { replace: true })
}
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100 flex items-center justify-center px-6">
    <div class="text-center">
      <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-8 h-8 text-amber-400 mx-auto mb-4" />
      <p class="text-sm text-gray-400">Redirecting…</p>
    </div>
  </div>
</template>
