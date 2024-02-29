import type { UseFetchReturn } from '@vueuse/core'
import type { Ref } from 'vue'
import { useFetch } from '../fetch'

export const rescanSiteRequest: Ref<UseFetchReturn<any> | null> = ref(null)

export function rescanSite(done: () => void) {
  const fetch = useFetch<UseFetchReturn<any>>('/reports/rescan').post()
  rescanSiteRequest.value = fetch
  fetch.onFetchResponse(() => {
    done()
  })
}

export const isRescanSiteRequestRunning = computed(() => {
  return rescanSiteRequest.value?.isFetching
})
