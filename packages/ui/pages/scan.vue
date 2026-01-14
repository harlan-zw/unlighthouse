<script setup lang="ts">
import { useScan } from '~/composables/scan'
import { website } from '~/composables/unlighthouse'

const router = useRouter()

const {
  scanState,
  isScanning,
  isScanComplete,
  scanProgressPercent,
  cancelScan,
  formatTimeRemaining,
} = useScan()

const showCancelConfirm = ref(false)

const statusConfig = {
  idle: { label: 'Idle', icon: 'i-heroicons-pause-circle', color: 'text-gray-400' },
  starting: { label: 'Starting...', icon: 'i-heroicons-play-circle', color: 'text-amber-400' },
  discovering: { label: 'Discovering routes', icon: 'i-heroicons-magnifying-glass', color: 'text-blue-400' },
  scanning: { label: 'Scanning', icon: 'i-heroicons-bolt', color: 'text-amber-400' },
  complete: { label: 'Complete', icon: 'i-heroicons-check-circle', color: 'text-green-400' },
  cancelled: { label: 'Cancelled', icon: 'i-heroicons-x-circle', color: 'text-red-400' },
  error: { label: 'Error', icon: 'i-heroicons-exclamation-triangle', color: 'text-red-400' },
}

const currentStatus = computed(() => statusConfig[scanState.status] || statusConfig.idle)

// Progress ring calculations
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
  router.push('/')
}

// Auto-redirect to results when complete
watch(isScanComplete, (complete) => {
  if (complete) {
    setTimeout(() => router.push('/'), 2000)
  }
})
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100">
    <!-- Header -->
    <header class="border-b border-white/5 bg-[#0d0d0d]/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-white" />
            </div>
            <span class="font-semibold text-lg tracking-tight">Unlighthouse</span>
          </div>
          <div class="h-5 w-px bg-white/10" />
          <a
            v-if="website"
            :href="website"
            target="_blank"
            class="text-sm text-gray-400 hover:text-white transition-colors font-mono"
          >
            {{ website }}
          </a>
        </div>

        <div class="flex items-center gap-4">
          <!-- Status Badge -->
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

    <!-- Main Content -->
    <main class="max-w-4xl mx-auto py-16 px-6">
      <!-- Progress Section -->
      <div class="flex flex-col items-center mb-12">
        <!-- Progress Ring -->
        <div class="relative mb-8">
          <svg :width="ringSize" :height="ringSize" class="-rotate-90">
            <!-- Background circle -->
            <circle
              :cx="ringSize / 2"
              :cy="ringSize / 2"
              :r="radius"
              fill="none"
              stroke="currentColor"
              :stroke-width="strokeWidth"
              class="text-white/5"
            />
            <!-- Progress circle -->
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
          <!-- Center content -->
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-4xl font-bold font-mono text-amber-400">{{ Math.round(scanProgressPercent) }}%</span>
            <span class="text-sm text-gray-500 mt-1">{{ scanState.progress.scanned }} / {{ scanState.progress.discovered }}</span>
          </div>
        </div>

        <!-- Status Text -->
        <div class="text-center mb-6">
          <h1 class="text-2xl font-semibold mb-2">
            <span v-if="isScanning">Scanning your site...</span>
            <span v-else-if="isScanComplete">Scan complete!</span>
            <span v-else-if="scanState.status === 'cancelled'">Scan cancelled</span>
            <span v-else-if="scanState.status === 'error'">Scan failed</span>
            <span v-else>Waiting to start</span>
          </h1>
          <p v-if="scanState.currentUrl" class="text-sm text-gray-400 font-mono truncate max-w-md">
            {{ scanState.currentUrl }}
          </p>
        </div>

        <!-- Stats -->
        <div class="flex gap-8 mb-8">
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold">
              {{ scanState.progress.discovered }}
            </div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">
              Discovered
            </div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold text-green-400">
              {{ scanState.progress.scanned }}
            </div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">
              Scanned
            </div>
          </div>
          <div v-if="scanState.progress.failed > 0" class="text-center">
            <div class="text-2xl font-mono font-semibold text-red-400">
              {{ scanState.progress.failed }}
            </div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">
              Failed
            </div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold">
              {{ formatTimeRemaining(scanState.estimatedTimeRemaining) }}
            </div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">
              Remaining
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <UButton
            v-if="isScanning"
            color="neutral"
            variant="outline"
            icon="i-heroicons-x-mark"
            @click="handleCancel"
          >
            Cancel Scan
          </UButton>
          <UButton
            v-if="isScanComplete || scanState.status === 'cancelled'"
            color="primary"
            icon="i-heroicons-chart-bar"
            @click="goToResults"
          >
            View Results
          </UButton>
        </div>
      </div>

      <!-- Live Feed -->
      <div v-if="scanState.recentlyCompleted.length > 0" class="bg-white/[0.02] border border-white/5 rounded-xl p-6">
        <h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Recently Completed
        </h2>
        <div class="space-y-2">
          <div
            v-for="(route, idx) in scanState.recentlyCompleted"
            :key="route.path + idx"
            class="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
          >
            <span class="font-mono text-sm text-gray-300 truncate flex-1">{{ route.path }}</span>
            <div class="flex items-center gap-2 ml-4">
              <div
                class="w-8 h-8 rounded flex items-center justify-center font-mono text-sm font-semibold"
                :class="[getScoreBg(route.score), getScoreColor(route.score)]"
              >
                {{ route.score }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state when no routes yet -->
      <div v-else-if="isScanning" class="flex flex-col items-center py-12">
        <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-8 h-8 text-amber-400 mb-4" />
        <p class="text-gray-500">
          Waiting for routes to complete...
        </p>
      </div>
    </main>

    <!-- Cancel Confirmation Modal -->
    <UModal v-model:open="showCancelConfirm" title="Cancel Scan?">
      <template #body>
        <p class="text-gray-400 p-4">
          Are you sure you want to cancel the scan? Progress will be lost and you'll need to start over.
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
