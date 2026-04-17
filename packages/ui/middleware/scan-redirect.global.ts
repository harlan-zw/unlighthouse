import { isActiveScanStatus } from '~/composables/scan'
import { apiUrl } from '~/composables/unlighthouse'

export default defineNuxtRouteMiddleware(async (to) => {
  // Only redirect from home page
  if (to.path !== '/')
    return

  const [history, currentScan, scanStatus] = await Promise.all([
    $fetch<{ scans: { id: string }[] }>(`${apiUrl.value}/history`).catch(() => null),
    $fetch<{ scanId: string | null }>(`${apiUrl.value}/current-scan-id`).catch(() => null),
    $fetch<{ status: string, paused: boolean }>(`${apiUrl.value}/scan/status`).catch(() => null),
  ])

  const hasActiveScan = !!currentScan?.scanId
    && isActiveScanStatus(scanStatus?.status, scanStatus?.paused)

  if (hasActiveScan)
    return navigateTo(`/results/${currentScan.scanId}/scan`)

  // No history at all → send to onboarding
  if (!history?.scans?.length)
    return navigateTo('/onboarding')
})
