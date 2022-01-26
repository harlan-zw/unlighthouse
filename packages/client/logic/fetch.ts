import {apiUrl} from "./static";
import {createFetch} from "@vueuse/core";

export function useFetch<T>(url: string) {
  const fetch = createFetch({ baseUrl: apiUrl })
  return fetch<T>(url)
}
