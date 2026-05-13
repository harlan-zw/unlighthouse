<script setup lang="ts">
defineProps<{
  title?: string
  message?: string
  showRetry?: boolean
  showHome?: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()

const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
    <div class="size-16 rounded-full bg-error/10 flex items-center justify-center mb-6">
      <UIcon name="i-heroicons-exclamation-triangle" class="size-8 text-error" />
    </div>
    <h1 class="text-2xl font-semibold text-highlighted mb-2">
      {{ title || 'Request failed' }}
    </h1>
    <p class="text-muted max-w-md mb-6 font-mono text-sm">
      {{ message || 'No response from the server. Check the dev server is running and retry.' }}
    </p>
    <div class="flex gap-3">
      <UButton
        v-if="showRetry !== false"
        color="primary"
        icon="i-heroicons-arrow-path"
        @click="$emit('retry')"
      >
        Retry
      </UButton>
      <UButton
        v-if="showHome"
        color="neutral"
        variant="outline"
        icon="i-heroicons-home"
        @click="goHome"
      >
        Open dashboard
      </UButton>
    </div>
  </div>
</template>
