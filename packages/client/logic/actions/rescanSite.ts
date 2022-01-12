import type { UseFetchReturn } from '@vueuse/core'
import { useFetch } from '@vueuse/core'
import type { Ref } from 'vue'
import { apiUrl } from '../static'

export const rescanSiteRequest: Ref<UseFetchReturn<any>|null> = ref(null)

export const rescanSite = (done: () => void) => {
  const fetch = useFetch(`${apiUrl}/reports/rescan`).post()
  rescanSiteRequest.value = fetch
  fetch.onFetchResponse(() => {
    done()
  })
}

export const isRescanSiteRequestRunning = computed(() => {
  return rescanSiteRequest.value?.isFetching
})
