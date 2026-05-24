<script setup lang="ts">
import { Button } from '@/components/ui/button'

const props = defineProps<{
  error: {
    statusCode?: number
    message?: string
    stack?: string
  }
}>()

function handleError() {
  clearError({ redirect: '/' })
}

const errorTitle = computed(() => {
  if (props.error.statusCode === 404)
    return 'Route not found'
  if (props.error.statusCode === 500)
    return 'Server error'
  return 'Request failed'
})

const errorMessage = computed(() => {
  if (props.error.statusCode === 404)
    return 'No route matches this path. Check the URL or open the dashboard.'
  return props.error.message || 'No response from the server. Check the dev server is running and retry.'
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
    <div class="max-w-md text-center">
      <div class="size-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-8">
        <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      </div>
      <h1 class="text-3xl font-semibold mb-3">
        {{ errorTitle }}
      </h1>
      <p class="text-muted-foreground mb-8">
        {{ errorMessage }}
      </p>

      <div v-if="error.statusCode" class="text-6xl font-mono font-bold text-muted-foreground/50 mb-8">
        {{ error.statusCode }}
      </div>

      <Button size="lg" @click="handleError">
        <Icon name="lucide:home" class="size-4 mr-2" />
        Open dashboard
      </Button>

      <details v-if="error.stack" class="mt-8 text-left">
        <summary class="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
          Technical details
        </summary>
        <pre class="mt-2 p-4 bg-muted rounded-lg text-xs text-muted-foreground overflow-auto max-h-48 font-mono">{{ error.stack }}</pre>
      </details>
    </div>
  </div>
</template>
