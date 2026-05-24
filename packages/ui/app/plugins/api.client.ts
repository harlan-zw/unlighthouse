import { createClient } from '@unlighthouse/core/api/client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const client = createClient({
    baseUrl: config.public.unlighthouseApiUrl as string,
  })
  return { provide: { api: client } }
})
