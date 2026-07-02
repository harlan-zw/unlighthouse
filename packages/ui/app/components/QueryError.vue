<script setup lang="ts">
import type { ApiError } from '~/composables/useApiError'

// Inline error surface for a primary `useApiQuery` read, mirroring
// nuxtseo.com's `UiErrorState` pattern: bind the query's normalized `error`
// and an `onRetry` (the query's `refresh`). Render it BEFORE the loading
// skeleton in templates (`v-if="error"` then `v-else-if="loading"`) so a
// failed fetch isn't masked by a skeleton while data stays null.
const { error, onRetry, retryLabel = 'Retry request' } = defineProps<{
  error: ApiError | null
  /** Retry handler — typically the query's `refresh`. Button shows when the error is retryable. */
  onRetry?: () => void
  retryLabel?: string
}>()
</script>

<template>
  <UiAlert
    v-if="error"
    status="error"
    :title="error.title"
    :description="error.message"
  >
    <template v-if="onRetry && error.retryable" #action>
      <UiButton size="xs" purpose="secondary" @click="onRetry()">
        {{ retryLabel }}
      </UiButton>
    </template>
  </UiAlert>
</template>
