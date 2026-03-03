import { apiUrl } from './unlighthouse'
import { unlighthouseReports, scanMeta } from './state'

export async function rescanSite() {
  if (!apiUrl.value) return

  // Clear current reports
  unlighthouseReports.value = []

  // Trigger rescan
  await $fetch(`${apiUrl.value}/rescan`, { method: 'POST' }).catch(console.warn)
}

export async function rescanRoute(path: string) {
  if (!apiUrl.value) return

  await $fetch(`${apiUrl.value}/rescan`, {
    method: 'POST',
    body: { paths: [path] },
  }).catch(console.warn)
}

export async function rescanRoutes(paths: string[]) {
  if (!apiUrl.value || !paths.length) return

  await $fetch(`${apiUrl.value}/rescan`, {
    method: 'POST',
    body: { paths },
  }).catch(console.warn)
}
