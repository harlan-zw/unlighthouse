<script setup lang="ts">
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

usePageTitle(errorTitle)

const errorMessage = computed(() => {
  if (props.error.statusCode === 404)
    return 'No route matches this path. Check the URL or open the dashboard.'
  return props.error.message || 'No response from the server. Check the dev server is running and retry.'
})
</script>

<template>
  <div class="min-h-screen bg-default text-default flex flex-col items-center justify-center p-6">
    <div class="max-w-md text-center">
      <div class="size-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-8">
        <UiIcon name="warning" class="size-8 text-error" />
      </div>
      <h1 class="text-3xl font-semibold mb-3">
        {{ errorTitle }}
      </h1>
      <p class="text-muted mb-8">
        {{ errorMessage }}
      </p>

      <div v-if="error.statusCode" class="text-6xl font-mono font-bold text-muted/50 mb-8">
        {{ error.statusCode }}
      </div>

      <UiButton purpose="cta" size="lg" icon="home" @click="handleError">
        Open dashboard
      </UiButton>

      <Disclosure v-if="error.stack" label="Technical details" class="mt-8 text-left text-muted hover:text-default">
        <CodeBlock :code="error.stack" class="mt-2" max-height="12rem" />
      </Disclosure>
    </div>
  </div>
</template>
