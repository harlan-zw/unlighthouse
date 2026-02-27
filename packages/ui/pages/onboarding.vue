<script setup lang="ts">
import { apiUrl } from '~/composables/unlighthouse'

const router = useRouter()
const toast = useToast()

// Form state
const siteUrl = ref('')
const device = ref<'mobile' | 'desktop'>('mobile')
const throttle = ref(false)
const sampleSize = ref<number | null>(null)
const categories = ref({
  performance: true,
  accessibility: true,
  'best-practices': true,
  seo: true,
})

const isSubmitting = ref(false)
const error = ref<string | null>(null)

// Validation
const isValidUrl = computed(() => {
  if (!siteUrl.value) return false
  // Allow URLs with or without protocol
  const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/i
  return urlPattern.test(siteUrl.value) || siteUrl.value.startsWith('localhost')
})

const canSubmit = computed(() => isValidUrl.value && !isSubmitting.value)

// Normalize URL
function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  return url
}

// Submit form
async function startScan() {
  if (!canSubmit.value) return

  isSubmitting.value = true
  error.value = null

  const selectedCategories = Object.entries(categories.value)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)

  const payload = {
    url: normalizeUrl(siteUrl.value),
    device: device.value,
    throttle: throttle.value,
    sampleSize: sampleSize.value,
    categories: selectedCategories,
  }

  const result = await $fetch<{ scanId: string, status: string }>(`${apiUrl.value}/scan/start`, {
    method: 'POST',
    body: payload,
  }).catch((e) => {
    error.value = e.message || 'Failed to start scan'
    return null
  })

  isSubmitting.value = false

  if (result?.scanId) {
    toast.add({ title: 'Scan started', color: 'success' })
    router.push(`/results/${result.scanId}/scan`)
  }
}

// Device options
const deviceOptions = [
  { label: 'Mobile', value: 'mobile', icon: 'i-heroicons-device-phone-mobile' },
  { label: 'Desktop', value: 'desktop', icon: 'i-heroicons-computer-desktop' },
]

// Sample size options
const sampleSizeOptions = [
  { label: 'All pages', value: null },
  { label: '10 pages', value: 10 },
  { label: '25 pages', value: 25 },
  { label: '50 pages', value: 50 },
  { label: '100 pages', value: 100 },
]
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100 flex items-center justify-center p-6">
    <div class="w-full max-w-lg">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
          <UIcon name="i-heroicons-light-bulb" class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white">Unlighthouse</h1>
        <p class="text-gray-400 mt-2">Scan your entire site with Lighthouse</p>
      </div>

      <!-- Form -->
      <div class="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
        <!-- URL Input -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-300 mb-2">Website URL</label>
          <UInput
            v-model="siteUrl"
            placeholder="example.com"
            size="lg"
            :ui="{ base: 'bg-white/5 border-white/10 focus:border-amber-500/50' }"
            @keyup.enter="startScan"
          />
          <p v-if="siteUrl && !isValidUrl" class="text-xs text-red-400 mt-1">
            Please enter a valid URL
          </p>
        </div>

        <!-- Device -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-300 mb-2">Device</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="opt in deviceOptions"
              :key="opt.value"
              class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all"
              :class="device === opt.value
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'"
              @click="device = opt.value as 'mobile' | 'desktop'"
            >
              <UIcon :name="opt.icon" class="w-5 h-5" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </div>

        <!-- Options -->
        <div class="mb-6 space-y-4">
          <label class="block text-sm font-medium text-gray-300">Options</label>

          <!-- Throttle -->
          <label class="flex items-center gap-3 cursor-pointer group">
            <input
              v-model="throttle"
              type="checkbox"
              class="w-5 h-5 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/20"
            >
            <div>
              <div class="text-sm text-white group-hover:text-amber-400 transition-colors">
                Enable throttling
              </div>
              <div class="text-xs text-gray-500">Simulate slower network conditions</div>
            </div>
          </label>

          <!-- Sample Size -->
          <div>
            <div class="text-sm text-gray-400 mb-2">Sample size (for large sites)</div>
            <USelectMenu
              v-model="sampleSize"
              :items="sampleSizeOptions"
              value-key="value"
              size="sm"
              class="w-full"
            />
          </div>
        </div>

        <!-- Categories -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-300 mb-3">Categories</label>
          <div class="grid grid-cols-2 gap-2">
            <label
              v-for="(enabled, key) in categories"
              :key="key"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <input
                v-model="categories[key]"
                type="checkbox"
                class="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500"
              >
              <span class="text-sm capitalize">{{ key.replace('-', ' ') }}</span>
            </label>
          </div>
        </div>

        <!-- Error -->
        <UAlert
          v-if="error"
          color="red"
          variant="subtle"
          :title="error"
          class="mb-6"
        />

        <!-- Submit -->
        <UButton
          block
          size="lg"
          color="primary"
          :loading="isSubmitting"
          :disabled="!canSubmit"
          @click="startScan"
        >
          <UIcon name="i-heroicons-play" class="w-5 h-5 mr-2" />
          Start Scan
        </UButton>
      </div>

      <!-- Footer -->
      <div class="text-center mt-6">
        <NuxtLink to="/" class="text-sm text-gray-500 hover:text-white transition-colors">
          View scan history
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
