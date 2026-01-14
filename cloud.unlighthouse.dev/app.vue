<script setup lang="ts">
const apiKey = useState<string | null>('apiKey', () => null)
const email = useState<string | null>('email', () => null)

// Load from localStorage on mount
onMounted(() => {
  if (process.client) {
    apiKey.value = localStorage.getItem('apiKey')
    email.value = localStorage.getItem('email')
  }
})

function logout() {
  if (process.client) {
    localStorage.removeItem('apiKey')
    localStorage.removeItem('email')
    apiKey.value = null
    email.value = null
  }
  navigateTo('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16 items-center">
          <div class="flex items-center">
            <h1 class="text-xl font-bold text-gray-900">
              ⚡ Lighthouse API
            </h1>
          </div>
          <div v-if="apiKey" class="flex items-center gap-4">
            <span class="text-sm text-gray-600">{{ email }}</span>
            <button
              class="text-sm text-red-600 hover:text-red-700"
              @click="logout"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <slot />
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
