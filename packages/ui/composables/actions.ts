import { unlighthouseReports } from './state'
import { apiUrl } from './unlighthouse'

export async function rescanSite() {
  if (!apiUrl.value)
    return

  // Clear current reports
  unlighthouseReports.value = []

  // Trigger rescan
  const result = await $fetch<{ scanId?: string }>(`${apiUrl.value}/reports/rescan`, { method: 'POST' }).catch((error) => {
    if (error?.data?.scanId)
      navigateTo(`/results/${error.data.scanId}/scan`)
    console.warn(error)
    return null
  })

  if (result?.scanId)
    await navigateTo(`/results/${result.scanId}/scan`)
}

export async function rescanRoute(path: string) {
  if (!apiUrl.value)
    return

  await $fetch(`${apiUrl.value}/rescan`, {
    method: 'POST',
    body: { paths: [path] },
  }).catch(console.warn)
}

export async function rescanRoutes(paths: string[]) {
  if (!apiUrl.value || !paths.length)
    return

  await $fetch(`${apiUrl.value}/rescan`, {
    method: 'POST',
    body: { paths },
  }).catch(console.warn)
}
