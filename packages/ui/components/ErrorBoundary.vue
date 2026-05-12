<script setup lang="ts">
const props = defineProps<{
  fallbackMessage?: string
}>()

const error = ref<Error | null>(null)
const errorInfo = ref<string>('')

onErrorCaptured((err, instance, info) => {
  error.value = err
  errorInfo.value = info
  console.error('ErrorBoundary caught:', err, info)
  return false // prevent error propagation
})

function retry() {
  error.value = null
  errorInfo.value = ''
}
</script>

<template>
  <div v-if="error" class="p-6 bg-error/10 border border-error/20 rounded-xl">
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center shrink-0">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-error" />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-error mb-1">{{ fallbackMessage || 'Something went wrong' }}</h3>
        <p class="text-sm text-muted mb-3">{{ error.message }}</p>
        <details v-if="errorInfo" class="text-xs text-dimmed mb-4">
          <summary class="cursor-pointer hover:text-muted">Technical details</summary>
          <pre class="mt-2 p-2 bg-default/40 rounded overflow-auto">{{ errorInfo }}</pre>
        </details>
        <UButton size="sm" color="neutral" variant="outline" icon="i-heroicons-arrow-path" @click="retry">
          Try Again
        </UButton>
      </div>
    </div>
  </div>
  <slot v-else />
</template>
