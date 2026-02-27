<template>
  <div>
    <div v-if="!apiKey" class="max-w-md mx-auto">
      <div class="bg-white rounded-lg shadow-lg p-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">
          Get Started
        </h2>

        <form @submit.prevent="createUser" class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              placeholder="you@example.com"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
          </div>

          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
              Name (optional)
            </label>
            <input
              id="name"
              v-model="name"
              type="text"
              placeholder="John Doe"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {{ loading ? 'Creating...' : 'Create API Key' }}
          </button>
        </form>

        <div v-if="error" class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-600">{{ error }}</p>
        </div>

        <div v-if="newApiKey" class="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p class="text-sm font-medium text-green-900 mb-2">
            ✓ API Key Created!
          </p>
          <div class="bg-white p-3 rounded border border-green-300 font-mono text-sm break-all mb-3">
            {{ newApiKey }}
          </div>
          <p class="text-xs text-green-700 mb-3">
            Save this key - you won't see it again!
          </p>
          <button
            @click="saveAndContinue"
            class="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 font-medium"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>

      <div class="mt-8 text-center text-sm text-gray-600">
        <p>Already have an API key?</p>
        <button
          @click="showExistingKey = true"
          class="text-blue-600 hover:text-blue-700 font-medium"
        >
          Enter it here
        </button>
      </div>

      <div v-if="showExistingKey" class="mt-4 bg-white rounded-lg shadow-lg p-6">
        <h3 class="text-lg font-semibold mb-4">Enter Existing API Key</h3>
        <input
          v-model="existingKey"
          type="text"
          placeholder="lh_..."
          class="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
        >
        <button
          @click="useExistingKey"
          class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>

    <div v-else class="space-y-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">
          Your API Key
        </h2>
        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium text-gray-700">API Key:</span>
            <button
              @click="copyApiKey"
              class="text-sm text-blue-600 hover:text-blue-700"
            >
              {{ copied ? '✓ Copied!' : 'Copy' }}
            </button>
          </div>
          <code class="text-sm font-mono text-gray-900 break-all">{{ apiKey }}</code>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">
          API Documentation
        </h2>

        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-900 mb-2">
              Run a Scan
            </h3>
            <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto"><code>curl -X POST https://your-domain.com/api/scan-browserless \
  -H "Authorization: Bearer {{ apiKey }}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "categories": ["performance", "accessibility"],
    "formFactor": "mobile"
  }'</code></pre>
          </div>

          <div>
            <h3 class="text-sm font-semibold text-gray-900 mb-2">
              Get Scan History
            </h3>
            <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto"><code>curl -H "Authorization: Bearer {{ apiKey }}" \
  https://your-domain.com/api/scans/history</code></pre>
          </div>

          <div>
            <h3 class="text-sm font-semibold text-gray-900 mb-2">
              Get Specific Scan
            </h3>
            <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto"><code>curl -H "Authorization: Bearer {{ apiKey }}" \
  https://your-domain.com/api/scans/1</code></pre>
          </div>
        </div>
      </div>

      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p class="text-sm text-blue-900">
          <strong>Note:</strong> All API endpoints require authentication via the Authorization header.
          See the <a href="https://github.com/harlan-zw/unlighthouse/tree/main/cloud.unlighthouse.dev" class="text-blue-600 hover:underline">full documentation</a> for more details.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const email = ref('')
const name = ref('')
const loading = ref(false)
const error = ref('')
const newApiKey = ref('')
const showExistingKey = ref(false)
const existingKey = ref('')
const copied = ref(false)

const apiKey = useState<string | null>('apiKey')
const userEmail = useState<string | null>('email')

async function createUser() {
  loading.value = true
  error.value = ''

  try {
    const response = await $fetch('/api/users/create', {
      method: 'POST',
      body: {
        email: email.value,
        name: name.value || undefined,
      },
    })

    newApiKey.value = response.apiKey
    userEmail.value = response.email
  }
  catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to create user'
  }
  finally {
    loading.value = false
  }
}

function saveAndContinue() {
  if (process.client && newApiKey.value) {
    localStorage.setItem('apiKey', newApiKey.value)
    localStorage.setItem('email', userEmail.value || email.value)
    apiKey.value = newApiKey.value
    newApiKey.value = ''
  }
}

function useExistingKey() {
  if (process.client && existingKey.value) {
    localStorage.setItem('apiKey', existingKey.value)
    apiKey.value = existingKey.value
  }
}

async function copyApiKey() {
  if (process.client && apiKey.value) {
    await navigator.clipboard.writeText(apiKey.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}
</script>
