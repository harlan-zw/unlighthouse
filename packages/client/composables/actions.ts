import { apiUrl, isStatic } from './unlighthouse'

const isRescanRunning = ref(false)

export const isRescanSiteRequestRunning = computed(() => isRescanRunning.value)

export function rescanSite() {
  if (isStatic.value || isRescanRunning.value)
    return Promise.resolve()

  isRescanRunning.value = true
  return $fetch(`${apiUrl.value}/reports/rescan`, { method: 'POST' })
    .finally(() => {
      isRescanRunning.value = false
    })
}
