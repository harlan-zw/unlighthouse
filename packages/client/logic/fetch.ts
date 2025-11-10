import { createFetch } from '@vueuse/core'
import { apiUrl } from './static'

export function useApiFetch<T>(url: string) {
  const fetch = createFetch({ baseUrl: apiUrl })
  return fetch<T>(url)
}
