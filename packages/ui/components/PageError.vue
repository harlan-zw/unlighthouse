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
  router.push('/onboarding')
}
</script>

<template>
  <div class="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
    <div class="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-400" />
    </div>
    <h1 class="text-2xl font-semibold text-white mb-2">{{ title || 'Something went wrong' }}</h1>
    <p class="text-gray-400 max-w-md mb-6">{{ message || 'An unexpected error occurred. Please try again.' }}</p>
    <div class="flex gap-3">
      <UButton
        v-if="showRetry !== false"
        color="primary"
        icon="i-heroicons-arrow-path"
        @click="$emit('retry')"
      >
        Try Again
      </UButton>
      <UButton
        v-if="showHome"
        color="neutral"
        variant="outline"
        icon="i-heroicons-home"
        @click="goHome"
      >
        Go Home
      </UButton>
    </div>
  </div>
</template>
