import { apiUrl } from '~/composables/unlighthouse'

export default defineNuxtRouteMiddleware(async (to) => {
  // Only redirect from home page
  if (to.path !== '/')
    return

  const data = await $fetch<{ scans: { id: string }[] }>(`${apiUrl.value}/history`).catch(() => null)

  // No history at all → send to onboarding
  if (!data?.scans?.length)
    return navigateTo('/onboarding')
})
