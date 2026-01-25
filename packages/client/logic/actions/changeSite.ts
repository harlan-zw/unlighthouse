import type { UseFetchReturn } from '@vueuse/core'
import type { Ref } from 'vue'
import { useFetch } from '../fetch'

export const changeSiteRequest: Ref<UseFetchReturn<any> | null> = ref(null)
export const startScanRequest: Ref<UseFetchReturn<any> | null> = ref(null)
export const isChangeSiteModalOpen = ref(false)
export const newSiteUrl = ref('')

export function openChangeSiteModal() {
  isChangeSiteModalOpen.value = true
}

export function closeChangeSiteModal() {
  isChangeSiteModalOpen.value = false
  newSiteUrl.value = ''
}

// Start scan with the current site (used when CLI started with --wait)
export async function startScan(done: () => void) {
  const fetch = useFetch<UseFetchReturn<any>>('/start-scan').post().json()
  startScanRequest.value = fetch
  fetch.onFetchResponse(() => {
    done()
  })
}

// Change site and start scanning
export async function changeSite(site: string, done: () => void) {
  const encodedSite = encodeURIComponent(site)
  const fetch = useFetch<UseFetchReturn<any>>(`/change-site?site=${encodedSite}`).post().json()
  changeSiteRequest.value = fetch
  fetch.onFetchResponse(() => {
    closeChangeSiteModal()
    // Reload the page to get fresh data
    window.location.reload()
    done()
  })
}

export const isChangeSiteRequestRunning = computed(() => {
  return changeSiteRequest.value?.isFetching || startScanRequest.value?.isFetching
})
