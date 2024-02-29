import { createFetch } from '@vueuse/core'
import { apiUrl } from './static'

export function useFetch<T>(url: string) {
  const fetch = createFetch({ baseUrl: apiUrl })
  return fetch<T>(url)
}
