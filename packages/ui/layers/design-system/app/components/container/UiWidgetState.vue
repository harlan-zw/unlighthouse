<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'
import { computed, onMounted, ref } from 'vue'

const {
  status,
  error,
  empty,
  skeletonLines = 5,
  skeletonType = 'text',
  emptyIcon = 'i-lucide-inbox',
  emptyTitle = 'No data',
  emptyMessage = 'There is no data to display',
} = defineProps<{
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: Error | null
  empty?: boolean
  skeletonLines?: number
  skeletonType?: 'text' | 'bar' | 'circle'
  emptyIcon?: UiIcon
  emptyTitle?: string
  emptyMessage?: string
}>()

const emit = defineEmits<{
  retry: []
}>()

// Suppress loading skeletons until after hydration so server and client
// render the same branch. Lazy fetches transfer data via the SSR payload,
// making status jump from pending→success between render and hydrate.
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
const isLoading = computed(() => hydrated.value && (status === 'pending' || status === 'idle'))
const isError = computed(() => status === 'error' && !!error)
const isEmpty = computed(() => status === 'success' && empty)
</script>

<template>
  <div data-ui="UiWidgetState" :aria-busy="isLoading">
    <slot v-if="isLoading" name="loading">
      <span class="sr-only" role="status" aria-live="polite">Loading…</span>
      <UiSkeleton v-if="skeletonType === 'text'" :lines="skeletonLines" />
      <div v-else-if="skeletonType === 'bar'" class="flex items-end gap-1 h-40">
        <UiSkeleton v-for="i in skeletonLines" :key="i" type="bar" :index="i" />
      </div>
      <UiSkeleton v-else type="circle" :base="skeletonLines" />
    </slot>
    <slot v-else-if="isError" name="error" :error="error" :retry="() => emit('retry')">
      <div class="flex flex-col items-center justify-center py-8 px-4 text-center" role="alert">
        <div class="size-10 rounded-xl bg-error/10 flex items-center justify-center mb-3">
          <UiIcon name="i-lucide-alert-circle" class="size-5 text-error" aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-default mb-1">
          Something went wrong
        </p>
        <p v-if="error?.message" class="text-xs text-muted mb-3">
          {{ error.message }}
        </p>
        <UiButton size="xs" purpose="secondary" icon="refresh" @click="emit('retry')">
          Retry
        </UiButton>
      </div>
    </slot>
    <slot v-else-if="isEmpty" name="empty">
      <EmptyState :icon="emptyIcon" :title="emptyTitle" :description="emptyMessage" compact />
    </slot>
    <slot v-else />
  </div>
</template>
