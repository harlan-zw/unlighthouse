import { apiUrl, isStatic } from './unlighthouse'

const isRescanRunning = ref(false)

export const isRescanSiteRequestRunning = computed(() => isRescanRunning.value)

export async function rescanSite(): Promise<void> {
  if (isStatic.value || isRescanRunning.value) return

  isRescanRunning.value = true
  await $fetch(`${apiUrl.value}/reports/rescan`, { method: 'POST' })
    .finally(() => {
      isRescanRunning.value = false
    })
}
