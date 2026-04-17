<script setup lang="ts">
import { useScan } from '~/composables/scan'
import { website } from '~/composables/unlighthouse'

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

const {
  scanState,
  isScanning,
  isScanComplete,
  scanProgressPercent,
  cancelScan,
  pauseScan,
  resumeScan,
  retryScan,
  formatTimeRemaining,
} = useScan()

const displayWebsite = computed(() => scanState.site || website.value)
const hasPartialResults = computed(() => scanState.progress.scanned > 0 || scanState.recentlyCompleted.length > 0)

const showCancelConfirm = ref(false)

const statusConfig = {
  idle: { label: 'Idle', icon: 'i-heroicons-pause-circle', color: 'text-gray-400' },
  starting: { label: 'Starting...', icon: 'i-heroicons-play-circle', color: 'text-amber-400' },
  discovering: { label: 'Discovering routes', icon: 'i-heroicons-magnifying-glass', color: 'text-blue-400' },
  scanning: { label: 'Scanning', icon: 'i-heroicons-bolt', color: 'text-amber-400' },
  paused: { label: 'Paused', icon: 'i-heroicons-pause-circle', color: 'text-yellow-400' },
  complete: { label: 'Complete', icon: 'i-heroicons-check-circle', color: 'text-green-400' },
  cancelled: { label: 'Cancelled', icon: 'i-heroicons-x-circle', color: 'text-red-400' },
  error: { label: 'Error', icon: 'i-heroicons-exclamation-triangle', color: 'text-red-400' },
}

const currentStatusKey = computed(() => {
  if (scanState.paused)
    return 'paused'
  return scanState.status
})

const currentStatus = computed(() => statusConfig[currentStatusKey.value] || statusConfig.idle)

const ringSize = 200
const strokeWidth = 12
const radius = (ringSize - strokeWidth) / 2
const circumference = 2 * Math.PI * radius
const strokeDashoffset = computed(() => {
  const progress = scanProgressPercent.value / 100
  return circumference * (1 - progress)
})

function getScoreColor(score: number) {
  if (score >= 90)
    return 'text-green-400'
  if (score >= 50)
    return 'text-amber-400'
  return 'text-red-400'
}

function getScoreBg(score: number) {
  if (score >= 90)
    return 'bg-green-500/10'
  if (score >= 50)
    return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

function handleCancel() {
  showCancelConfirm.value = true
}

async function confirmCancel() {
  await cancelScan()
  showCancelConfirm.value = false
}

function goToResults() {
  navigateTo(`/results/${scanId.value}`)
}

function goBack() {
  navigateTo('/history')
}

watch(isScanComplete, (complete) => {
  if (complete)
    setTimeout(() => navigateTo(`/results/${scanId.value}`), 2000)
})

const extractDomain = (url: string) => {
  try { return new URL(url).hostname }
  catch { return url }
}
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100">
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
          <div v-if="displayWebsite" class="flex items-center gap-2">
            <img
              :src="`https://www.google.com/s2/favicons?domain=${extractDomain(displayWebsite)}&sz=32`"
              :alt="displayWebsite"
              class="w-5 h-5 rounded"
              loading="lazy"
              width="20"
              height="20"
            >
            <a
              :href="displayWebsite"
              target="_blank"
              class="text-sm text-gray-400 hover:text-white transition-colors font-mono"
            >
              {{ displayWebsite }}
            </a>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <UButton variant="ghost" color="neutral" size="sm" @click="goBack">
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
            Back
          </UButton>

          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-full border"
            :class="isScanning ? 'bg-amber-500/10 border-amber-500/20' : isScanComplete ? 'bg-green-500/10 border-green-500/20' : 'bg-white/5 border-white/10'"
          >
            <UIcon :name="currentStatus.icon" class="w-4 h-4" :class="currentStatus.color" />
            <span class="text-sm" :class="currentStatus.color">{{ currentStatus.label }}</span>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto py-16 px-6">
      <div class="flex flex-col items-center mb-12">
        <div class="relative mb-8">
          <svg :width="ringSize" :height="ringSize" class="-rotate-90">
            <circle
              :cx="ringSize / 2"
              :cy="ringSize / 2"
              :r="radius"
              fill="none"
              stroke="currentColor"
              :stroke-width="strokeWidth"
              class="text-white/5"
            />
            <circle
              :cx="ringSize / 2"
              :cy="ringSize / 2"
              :r="radius"
              fill="none"
              stroke="currentColor"
              :stroke-width="strokeWidth"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="strokeDashoffset"
              stroke-linecap="round"
              class="text-amber-500 transition-all duration-500"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-4xl font-bold font-mono text-amber-400">{{ Math.round(scanProgressPercent) }}%</span>
            <span class="text-sm text-gray-500 mt-1">{{ scanState.progress.scanned }} / {{ scanState.progress.discovered }}</span>
          </div>
        </div>

        <div class="text-center mb-6">
          <h1 class="text-2xl font-semibold mb-2">
            <span v-if="scanState.paused">Scan paused</span>
            <span v-else-if="isScanning">Scanning your site…</span>
            <span v-else-if="isScanComplete">Scan complete!</span>
            <span v-else-if="scanState.status === 'cancelled'">Scan cancelled</span>
            <span v-else-if="scanState.status === 'error'">Scan failed</span>
            <span v-else>Waiting to start</span>
          </h1>
          <p v-if="scanState.currentUrl && !scanState.error" class="text-sm text-gray-400 font-mono truncate max-w-md">
            {{ scanState.currentUrl }}
          </p>
        </div>

        <div v-if="scanState.status === 'error'" class="mb-8 max-w-md mx-auto">
          <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <h3 class="font-medium text-red-400 mb-1">Something went wrong</h3>
                <p class="text-sm text-gray-400">{{ scanState.error || 'An unexpected error occurred during the scan.' }}</p>
              </div>
            </div>
          </div>
          <div class="flex justify-center gap-3 mt-4">
            <UButton
              color="primary"
              icon="i-heroicons-arrow-path"
              @click="retryScan"
            >
              Start Fresh Scan
            </UButton>
            <UButton
              v-if="hasPartialResults"
              color="neutral"
              variant="outline"
              icon="i-heroicons-chart-bar"
              @click="goToResults"
            >
              View Partial Results
            </UButton>
            <UButton
              v-else
              color="neutral"
              variant="outline"
              icon="i-heroicons-home"
              @click="navigateTo('/onboarding')"
            >
              Start New
            </UButton>
          </div>
        </div>

        <div class="flex gap-8 mb-8">
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold">{{ scanState.progress.discovered }}</div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">Discovered</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold text-green-400">{{ scanState.progress.scanned }}</div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">Scanned</div>
          </div>
          <div v-if="scanState.progress.failed > 0" class="text-center">
            <div class="text-2xl font-mono font-semibold text-red-400">{{ scanState.progress.failed }}</div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">Failed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold">{{ formatTimeRemaining(scanState.estimatedTimeRemaining) }}</div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">Remaining</div>
          </div>
        </div>

        <div class="flex gap-3">
          <UButton
            v-if="isScanning && !scanState.paused"
            color="neutral"
            variant="outline"
            icon="i-heroicons-pause"
            @click="pauseScan"
          >
            Pause
          </UButton>
          <UButton
            v-if="scanState.paused"
            color="primary"
            icon="i-heroicons-play"
            @click="resumeScan"
          >
            Resume
          </UButton>
          <UButton
            v-if="isScanning || scanState.paused"
            color="neutral"
            variant="outline"
            icon="i-heroicons-x-mark"
            @click="handleCancel"
          >
            Cancel
          </UButton>
          <UButton
            v-if="(isScanning || scanState.paused) && scanState.progress.scanned > 0"
            color="primary"
            icon="i-heroicons-chart-bar"
            @click="goToResults"
          >
            Preview Results
          </UButton>
          <UButton
            v-if="isScanComplete || scanState.status === 'cancelled'"
            color="primary"
            icon="i-heroicons-chart-bar"
            @click="goToResults"
          >
            {{ hasPartialResults ? 'View Partial Results' : 'View Results' }}
          </UButton>
        </div>
      </div>

      <div v-if="scanState.recentlyCompleted.length > 0" class="bg-white/[0.02] border border-white/5 rounded-xl p-6">
        <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Recently Completed</h2>
        <div class="space-y-2">
          <div
            v-for="(completedRoute, idx) in scanState.recentlyCompleted"
            :key="completedRoute.path + idx"
            class="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
          >
            <span class="font-mono text-sm text-gray-300 truncate flex-1">{{ completedRoute.path }}</span>
            <div class="flex items-center gap-2 ml-4">
              <div
                class="w-8 h-8 rounded flex items-center justify-center font-mono text-sm font-semibold"
                :class="[getScoreBg(completedRoute.score), getScoreColor(completedRoute.score)]"
              >
                {{ completedRoute.score }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="isScanning" class="flex flex-col items-center py-12">
        <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-8 h-8 text-amber-400 mb-4" />
        <p class="text-gray-500">Waiting for routes to complete...</p>
      </div>
    </main>

    <UModal v-model:open="showCancelConfirm" title="Cancel Scan?">
      <template #body>
        <p class="text-gray-400 p-4">
          Cancel the active scan? Completed routes will stay available, but unfinished work will stop and a fresh scan will start from zero.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 p-4">
          <UButton variant="ghost" color="neutral" @click="showCancelConfirm = false">
            Keep Scanning
          </UButton>
          <UButton color="error" @click="confirmCancel">
            Cancel Scan
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
