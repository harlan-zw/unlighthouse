<script setup lang="ts">
import { computed } from 'vue'

interface RateLimitInfo {
  isRateLimited?: boolean
  tier?: string
  retryAfter?: number
  resetAt?: Date
}

interface ErrorLike {
  message: string
  rateLimitInfo?: RateLimitInfo
}

const props = defineProps<{
  error: string | ErrorLike | null
}>()

const isRateLimited = computed(() => {
  if (!props.error || typeof props.error === 'string')
    return false
  return props.error.rateLimitInfo?.isRateLimited ?? false
})

const displayMessage = computed(() => {
  if (!props.error)
    return ''
  if (typeof props.error === 'string')
    return props.error
  return props.error.message
})

const resetInfo = computed(() => {
  if (!props.error || typeof props.error === 'string')
    return null

  const info = props.error.rateLimitInfo
  if (!info)
    return null

  if (info.retryAfter)
    return `Try again in ${info.retryAfter} seconds`

  if (info.resetAt) {
    const diff = info.resetAt.getTime() - Date.now()
    if (diff > 0) {
      if (diff < 60000)
        return `Resets in ${Math.ceil(diff / 1000)} seconds`
      if (diff < 3600000)
        return `Resets in ${Math.ceil(diff / 60000)} minutes`
      return 'Resets at midnight UTC'
    }
  }

  return null
})
</script>

<template>
  <UAlert
    v-if="error"
    :color="isRateLimited ? 'warning' : 'error'"
    variant="subtle"
    :icon="isRateLimited ? 'i-carbon-time' : 'i-carbon-warning-alt'"
    :role="isRateLimited ? 'status' : 'alert'"
    :aria-live="isRateLimited ? 'polite' : 'assertive'"
    class="mb-8"
  >
    <template #title>
      <span v-if="isRateLimited">Rate Limit Reached</span>
      <span v-else>{{ displayMessage }}</span>
    </template>
    <template v-if="isRateLimited || $slots.action" #description>
      <p v-if="isRateLimited" class="mb-2">
        {{ displayMessage }}
      </p>
      <p v-if="resetInfo" class="text-sm opacity-80 mb-3">
        {{ resetInfo }}
      </p>
      <slot name="action" :error="error" :is-rate-limited="isRateLimited" />
    </template>
  </UAlert>
</template>
