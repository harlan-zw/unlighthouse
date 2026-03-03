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
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100 flex flex-col items-center justify-center p-6">
    <div class="max-w-md text-center">
      <div class="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-8">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-10 h-10 text-red-400" />
      </div>
      <h1 class="text-3xl font-semibold text-white mb-3">{{ errorTitle }}</h1>
      <p class="text-gray-400 mb-8">{{ errorMessage }}</p>

      <div v-if="error.statusCode" class="text-6xl font-mono font-bold text-gray-800 mb-8">
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
        <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-400">Technical details</summary>
        <pre class="mt-2 p-4 bg-black/30 rounded-lg text-xs text-gray-500 overflow-auto max-h-48">{{ error.stack }}</pre>
      </details>
    </div>
  </div>
</template>
