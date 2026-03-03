<script setup lang="ts">
import { apiUrl } from '~/composables/unlighthouse'

const router = useRouter()
const toast = useToast()

// Fetch recent scans for URL suggestions
const { data: historyData } = await useFetch<{ scans: Array<{ site: string }> }>(`${apiUrl.value}/history`)
const recentUrls = computed(() => {
  const sites = historyData.value?.scans?.map(s => s.site) || []
  return [...new Set(sites)].slice(0, 5) // Unique, max 5
})

const form = reactive({
  url: '',
  device: 'mobile' as 'mobile' | 'desktop',
  throttle: true,
  sampleSize: 0, // 0 = unlimited
  categories: ['performance', 'accessibility', 'best-practices', 'seo'] as string[],
})

const isSubmitting = ref(false)
const urlError = ref('')
const showRecentUrls = ref(false)
const urlInputFocused = ref(false)

const sampleSizeOptions = [
  { label: '10 routes', value: 10 },
  { label: '50 routes', value: 50 },
  { label: '100 routes', value: 100 },
  { label: 'Unlimited', value: 0 },
]

const categoryOptions = [
  { label: 'Performance', value: 'performance', icon: 'i-heroicons-bolt' },
  { label: 'Accessibility', value: 'accessibility', icon: 'i-heroicons-eye' },
  { label: 'Best Practices', value: 'best-practices', icon: 'i-heroicons-shield-check' },
  { label: 'SEO', value: 'seo', icon: 'i-heroicons-magnifying-glass' },
]

const presets = [
  {
    id: 'quick',
    label: 'Quick',
    description: '10 routes, no throttle',
    icon: 'i-heroicons-bolt',
    config: { sampleSize: 10, throttle: false, categories: ['performance', 'accessibility', 'best-practices', 'seo'] },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: '50 routes, throttled',
    icon: 'i-heroicons-scale',
    config: { sampleSize: 50, throttle: true, categories: ['performance', 'accessibility', 'best-practices', 'seo'] },
  },
  {
    id: 'thorough',
    label: 'Thorough',
    description: 'All routes, throttled',
    icon: 'i-heroicons-magnifying-glass-circle',
    config: { sampleSize: 0, throttle: true, categories: ['performance', 'accessibility', 'best-practices', 'seo'] },
  },
]

const activePreset = ref<string | null>(null)
const showAdvanced = ref(false)

function applyPreset(preset: typeof presets[0]) {
  activePreset.value = preset.id
  form.sampleSize = preset.config.sampleSize
  form.throttle = preset.config.throttle
  form.categories = [...preset.config.categories]
}

// Clear preset when manually changing settings
watch([() => form.sampleSize, () => form.throttle, () => form.categories], () => {
  if (activePreset.value) {
    const preset = presets.find(p => p.id === activePreset.value)
    if (preset) {
      const matches = form.sampleSize === preset.config.sampleSize
        && form.throttle === preset.config.throttle
        && form.categories.length === preset.config.categories.length
      if (!matches) activePreset.value = null
    }
  }
}, { deep: true })

function validateUrl(url: string): boolean {
  if (!url.trim()) {
    urlError.value = 'URL is required'
    return false
  }
  // Add protocol if missing
  let testUrl = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    testUrl = `https://${url}`
  }
  try {
    new URL(testUrl)
    urlError.value = ''
    return true
  }
  catch {
    urlError.value = 'Please enter a valid URL'
    return false
  }
}

function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  return url
}

async function startScan() {
  if (!validateUrl(form.url)) return

  isSubmitting.value = true

  const body: Record<string, any> = {
    url: normalizeUrl(form.url),
    device: form.device,
    throttle: form.throttle,
  }
  if (form.sampleSize > 0) body.sampleSize = form.sampleSize
  if (form.categories.length < 4) body.categories = form.categories

  const result = await $fetch<{ scanId: string }>(`${apiUrl.value}/scan/start`, {
    method: 'POST',
    body,
  }).catch((err) => {
    toast.add({ title: 'Failed to start scan', description: err.message, color: 'error' })
    isSubmitting.value = false
    return null
  })

  if (result?.scanId) {
    navigateTo(`/results/${result.scanId}/scan`)
  }
}

function toggleCategory(value: string) {
  const idx = form.categories.indexOf(value)
  if (idx === -1) {
    form.categories.push(value)
  }
  else if (form.categories.length > 1) {
    form.categories.splice(idx, 1)
  }
}

function selectRecentUrl(url: string) {
  form.url = url
  showRecentUrls.value = false
  validateUrl(url)
}

function onUrlFocus() {
  urlInputFocused.value = true
  if (recentUrls.value.length > 0 && !form.url)
    showRecentUrls.value = true
}

function onUrlBlur() {
  urlInputFocused.value = false
  // Delay hide to allow click on dropdown
  setTimeout(() => { showRecentUrls.value = false }, 150)
}
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100">
    <!-- Header -->
    <header class="border-b border-white/5 bg-[#0d0d0d]/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <NuxtLink to="/" class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-white" />
            </div>
            <span class="font-semibold text-lg tracking-tight">Unlighthouse</span>
          </NuxtLink>
          <div class="h-5 w-px bg-white/10" />
          <span class="text-sm text-gray-400">New Scan</span>
        </div>

        <NuxtLink to="/" class="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          Back
        </NuxtLink>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-2xl mx-auto py-16 px-6">
      <div class="text-center mb-12">
        <h1 class="text-3xl font-bold mb-3">Start a New Scan</h1>
        <p class="text-gray-400">Enter a URL to scan your site with Lighthouse</p>
      </div>

      <form class="space-y-8" @submit.prevent="startScan">
        <!-- URL Input -->
        <div class="relative">
          <label class="block text-sm font-medium text-gray-300 mb-2">Website URL</label>
          <UInput
            v-model="form.url"
            placeholder="example.com"
            size="xl"
            icon="i-heroicons-globe-alt"
            :ui="{ base: 'bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-amber-500/20' }"
            @focus="onUrlFocus"
            @blur="onUrlBlur"
          />
          <p v-if="urlError" class="mt-2 text-sm text-red-400">{{ urlError }}</p>

          <!-- Recent URLs Dropdown -->
          <div
            v-if="showRecentUrls && recentUrls.length > 0"
            class="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden"
          >
            <div class="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
              Recent scans
            </div>
            <button
              v-for="url in recentUrls"
              :key="url"
              type="button"
              class="w-full px-3 py-2.5 text-left font-mono text-sm text-gray-300 hover:bg-white/5 hover:text-amber-400 transition-colors flex items-center gap-2"
              @click="selectRecentUrl(url)"
            >
              <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-500" />
              {{ url }}
            </button>
          </div>
        </div>

        <!-- Presets -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-3">Scan Type</label>
          <div class="grid grid-cols-3 gap-3">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              class="flex flex-col items-center gap-2 p-4 rounded-lg border transition-all"
              :class="activePreset === preset.id
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'"
              @click="applyPreset(preset)"
            >
              <UIcon :name="preset.icon" class="w-6 h-6" />
              <span class="font-medium">{{ preset.label }}</span>
              <span class="text-xs opacity-70">{{ preset.description }}</span>
            </button>
          </div>
        </div>

        <!-- Advanced Options Toggle -->
        <button
          type="button"
          class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          @click="showAdvanced = !showAdvanced"
        >
          <UIcon
            :name="showAdvanced ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="w-4 h-4"
          />
          Advanced options
        </button>

        <!-- Advanced Options -->
        <div v-if="showAdvanced" class="space-y-6 pl-6 border-l border-white/5">
          <!-- Device Toggle -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-3">Device</label>
            <div class="flex gap-3">
              <button
                type="button"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all"
                :class="form.device === 'mobile'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'"
                @click="form.device = 'mobile'"
              >
                <UIcon name="i-heroicons-device-phone-mobile" class="w-5 h-5" />
                Mobile
              </button>
              <button
                type="button"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all"
                :class="form.device === 'desktop'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'"
                @click="form.device = 'desktop'"
              >
                <UIcon name="i-heroicons-computer-desktop" class="w-5 h-5" />
                Desktop
              </button>
            </div>
          </div>

          <!-- Throttling Toggle -->
          <div class="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-lg">
            <div>
              <div class="font-medium">Network Throttling</div>
              <div class="text-sm text-gray-500">Simulate slower network conditions</div>
            </div>
            <USwitch v-model="form.throttle" />
          </div>

          <!-- Sample Size -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-3">Sample Size</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="option in sampleSizeOptions"
                :key="option.value"
                type="button"
                class="px-3 py-2 rounded-lg border text-sm transition-all"
                :class="form.sampleSize === option.value
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'"
                @click="form.sampleSize = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <!-- Categories -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-3">Categories</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="cat in categoryOptions"
                :key="cat.value"
                type="button"
                class="flex items-center gap-2 px-4 py-3 rounded-lg border text-sm transition-all"
                :class="form.categories.includes(cat.value)
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'"
                @click="toggleCategory(cat.value)"
              >
                <UIcon :name="cat.icon" class="w-4 h-4" />
                {{ cat.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Submit -->
        <UButton
          type="submit"
          color="primary"
          size="xl"
          block
          :loading="isSubmitting"
          :disabled="!form.url.trim() || isSubmitting"
        >
          <UIcon name="i-heroicons-bolt" class="w-5 h-5 mr-2" />
          Start Scan
        </UButton>
      </form>
    </main>
  </div>
</template>
