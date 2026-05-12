<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode?: number
    message?: string
    stack?: string
  }
}>()

const router = useRouter()

function handleError() {
  clearError({ redirect: '/onboarding' })
}

const errorTitle = computed(() => {
  if (props.error.statusCode === 404) return 'Page not found'
  if (props.error.statusCode === 500) return 'Server error'
  return 'Something went wrong'
})

const errorMessage = computed(() => {
  if (props.error.statusCode === 404) return 'The page you are looking for does not exist.'
  return props.error.message || 'An unexpected error occurred.'
})
</script>

<template>
  <div class="min-h-screen bg-default text-default flex flex-col items-center justify-center p-6">
    <div class="max-w-md text-center">
      <div class="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-8">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-10 h-10 text-error" />
      </div>
      <h1 class="text-3xl font-semibold text-highlighted mb-3">{{ errorTitle }}</h1>
      <p class="text-muted mb-8">{{ errorMessage }}</p>

      <div v-if="error.statusCode" class="text-6xl font-mono font-bold text-dimmed mb-8">
        {{ error.statusCode }}
      </div>

      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-home"
        @click="handleError"
      >
        Go to Home
      </UButton>

      <details v-if="error.stack" class="mt-8 text-left">
        <summary class="text-sm text-dimmed cursor-pointer hover:text-muted">Technical details</summary>
        <pre class="mt-2 p-4 bg-black/30 rounded-lg text-xs text-dimmed overflow-auto max-h-48">{{ error.stack }}</pre>
      </details>
    </div>
  </div>
</template>
