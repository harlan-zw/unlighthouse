import { computed, onMounted, ref } from 'vue'
import { isStatic } from './static'

export const isServerAvailable = ref(true)
export const hasAttemptedConnection = ref(false)

export const isOfflineMode = computed(() => {
  if (isStatic)
    return false
  return hasAttemptedConnection.value && !isServerAvailable.value
})

export const hasNoData = computed(() => {
  // Check if we have no payload data in static mode, or no server connection in dynamic mode
  if (isStatic) {
    return !window.__unlighthouse_payload?.reports?.length
  }
  return isOfflineMode.value
})

export function checkServerConnection() {
  if (isStatic)
    return Promise.resolve(true)

  // Try to fetch a simple endpoint to check if server is available
  return fetch('/api/health', {
    method: 'GET',
    cache: 'no-cache',
  })
    .then(() => {
      isServerAvailable.value = true
      return true
    })
    .catch(() => {
      isServerAvailable.value = false
      return false
    })
    .finally(() => {
      hasAttemptedConnection.value = true
    })
}

export function useOfflineDetection() {
  onMounted(async () => {
    if (!isStatic) {
      await checkServerConnection()

      // Set up periodic health checks
      setInterval(async () => {
        await checkServerConnection()
      }, 30000) // Check every 30 seconds
    }
  })

  return {
    isOfflineMode,
    hasNoData,
    isServerAvailable,
    checkServerConnection,
  }
}
