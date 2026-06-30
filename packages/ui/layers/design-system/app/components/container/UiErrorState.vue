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
  /** Optional retry handler. When set (and no #action slot), renders a "Try again" button. */
  onRetry?: () => void
}>()

// Generic next-step for ordinary errors, which otherwise surfaced only the raw
// message with no guidance. Rate-limit errors carry their own `resetInfo`.
const NEXT_STEP = 'Try again in a moment. If it keeps happening, contact support.'

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
  <UiAlert
    v-if="error"
    :status="isRateLimited ? 'warning' : 'error'"
    :icon="isRateLimited ? 'clock' : 'caution'"
    :title="isRateLimited ? 'Rate Limit Reached' : displayMessage"
    class="mb-8"
  >
    <p v-if="isRateLimited" class="mt-1">
      {{ displayMessage }}
    </p>
    <p v-if="resetInfo" class="text-muted/80 mt-1">
      {{ resetInfo }}
    </p>
    <p v-else-if="!isRateLimited && !$slots.action" class="text-muted/80 mt-1">
      {{ NEXT_STEP }}
    </p>
    <slot name="action" :error="error" :is-rate-limited="isRateLimited" />
    <UiButton
      v-if="onRetry && !$slots.action"
      purpose="secondary"
      size="xs"
      icon="refresh"
      label="Try again"
      class="mt-2"
      @click="onRetry()"
    />
  </UiAlert>
</template>
