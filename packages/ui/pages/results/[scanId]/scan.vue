<script setup lang="ts">
import { apiUrl, websocketUrl } from '~/composables/unlighthouse'
import { getScoreColor, getScoreBg } from '~/composables/dashboard'

definePageMeta({ layout: 'results' })

const route = useRoute()
const router = useRouter()
const scanId = computed(() => route.params.scanId as string)

interface ScanStatus {
  scanId: string
  status: 'starting' | 'discovering' | 'scanning' | 'complete' | 'cancelled' | 'error'
  progress: {
    discovered: number
    scanned: number
    failed: number
    total: number
  }
  currentUrl?: string
  startedAt: string
  estimatedCompletion?: string
  error?: string
}

interface RecentRoute {
  path: string
  score: number | null
  scannedAt: string
}

const status = ref<ScanStatus | null>(null)
const recentRoutes = ref<RecentRoute[]>([])
const error = ref<string | null>(null)

// Computed progress
const progressPercent = computed(() => {
  if (!status.value?.progress) return 0
  const { scanned, total } = status.value.progress
  if (total === 0) return 0
  return Math.round((scanned / total) * 100)
})

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    starting: 'Starting...',
    discovering: 'Discovering routes...',
    scanning: 'Running Lighthouse audits...',
    complete: 'Scan complete',
    cancelled: 'Scan cancelled',
    error: 'Scan failed',
  }
  return labels[status.value?.status || 'starting'] || 'Unknown'
})

const statusColor = computed(() => {
  const colors: Record<string, string> = {
    starting: 'text-blue-400',
    discovering: 'text-blue-400',
    scanning: 'text-amber-400',
    complete: 'text-green-400',
    cancelled: 'text-gray-400',
    error: 'text-red-400',
  }
  return colors[status.value?.status || 'starting'] || 'text-gray-400'
})

// WebSocket for real-time updates
let ws: WebSocket | null = null

function connectWs() {
  if (!websocketUrl.value) return

  ws = new WebSocket(websocketUrl.value)

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.event === 'scan:progress') {
      if (status.value) {
        status.value.progress = data.payload
      }
    }
    else if (data.event === 'scan:route-complete') {
      const { route: routePath, scores } = data.payload
      recentRoutes.value.unshift({
        path: routePath,
        score: scores?.average ?? null,
        scannedAt: new Date().toISOString(),
      })
      // Keep only last 10
      if (recentRoutes.value.length > 10) {
        recentRoutes.value.pop()
      }
    }
    else if (data.event === 'scan:complete') {
      if (status.value) {
        status.value.status = 'complete'
      }
    }
    else if (data.event === 'scan:error') {
      error.value = data.payload?.message
      if (status.value) {
        status.value.status = 'error'
      }
    }
  }
}

// Fetch initial status
async function fetchStatus() {
  if (!apiUrl.value) return

  const data = await $fetch<ScanStatus>(`${apiUrl.value}/scan/status`).catch(() => null)
  if (data) {
    status.value = data
    if (data.status === 'complete') {
      // Redirect to results
      router.push(`/results/${scanId.value}`)
    }
  }
}

// Cancel scan
async function cancelScan() {
  if (!apiUrl.value) return

  await $fetch(`${apiUrl.value}/scan/cancel`, { method: 'POST' }).catch(console.warn)
  if (status.value) {
    status.value.status = 'cancelled'
  }
}

// View results
function viewResults() {
  router.push(`/results/${scanId.value}`)
}

// Polling fallback if WS not available
let pollInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchStatus()
  connectWs()

  // Poll every 2s as fallback
  pollInterval = setInterval(fetchStatus, 2000)
})

onUnmounted(() => {
  if (ws) ws.close()
  if (pollInterval) clearInterval(pollInterval)
})

// Format time
function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString()
}

function formatDuration(startIso: string): string {
  const start = new Date(startIso).getTime()
  const now = Date.now()
  const seconds = Math.floor((now - start) / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Progress Header -->
    <div class="text-center mb-8">
      <!-- Progress Circle -->
      <div class="relative w-40 h-40 mx-auto mb-6">
        <svg class="w-full h-full transform -rotate-90">
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="currentColor"
            stroke-width="8"
            fill="none"
            class="text-white/5"
          />
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="currentColor"
            stroke-width="8"
            fill="none"
            stroke-linecap="round"
            class="text-amber-500 transition-all duration-300"
            :stroke-dasharray="`${progressPercent * 4.4} 440`"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-4xl font-bold text-white">{{ progressPercent }}%</span>
          <span class="text-sm text-gray-400">complete</span>
        </div>
      </div>

      <div class="text-lg font-medium" :class="statusColor">
        {{ statusLabel }}
      </div>

      <div v-if="status?.startedAt" class="text-sm text-gray-500 mt-1">
        Running for {{ formatDuration(status.startedAt) }}
      </div>
    </div>

    <!-- Stats -->
    <div v-if="status?.progress" class="grid grid-cols-3 gap-4 mb-8">
      <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-white">{{ status.progress.discovered }}</div>
        <div class="text-xs text-gray-500 mt-1">Discovered</div>
      </div>
      <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold text-green-400">{{ status.progress.scanned }}</div>
        <div class="text-xs text-gray-500 mt-1">Scanned</div>
      </div>
      <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center">
        <div class="text-2xl font-bold" :class="status.progress.failed > 0 ? 'text-red-400' : 'text-gray-400'">
          {{ status.progress.failed }}
        </div>
        <div class="text-xs text-gray-500 mt-1">Failed</div>
      </div>
    </div>

    <!-- Current URL -->
    <div v-if="status?.currentUrl" class="mb-8">
      <div class="text-xs text-gray-500 mb-2">Currently scanning:</div>
      <div class="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
        <div class="flex items-center gap-3">
          <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-4 h-4 text-amber-400 shrink-0" />
          <span class="font-mono text-sm text-white truncate">{{ status.currentUrl }}</span>
        </div>
      </div>
    </div>

    <!-- Recent Routes -->
    <div v-if="recentRoutes.length" class="mb-8">
      <div class="text-xs text-gray-500 mb-2">Recently completed:</div>
      <div class="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
        <div
          v-for="r in recentRoutes"
          :key="r.path"
          class="px-4 py-3 flex items-center justify-between"
        >
          <span class="font-mono text-sm text-gray-300 truncate flex-1">{{ r.path }}</span>
          <div
            v-if="r.score !== null"
            class="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0"
            :class="[getScoreBg(r.score), getScoreColor(r.score)]"
          >
            {{ r.score }}
          </div>
          <span v-else class="text-xs text-gray-500">-</span>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-8">
      <UAlert
        color="red"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
        :title="error"
      />
    </div>

    <!-- Actions -->
    <div class="flex items-center justify-center gap-4">
      <UButton
        v-if="status?.status === 'scanning' || status?.status === 'discovering'"
        color="neutral"
        variant="outline"
        icon="i-heroicons-x-mark"
        @click="cancelScan"
      >
        Cancel Scan
      </UButton>

      <UButton
        v-if="status?.status === 'complete' || status?.status === 'cancelled'"
        color="primary"
        icon="i-heroicons-eye"
        @click="viewResults"
      >
        View Results
      </UButton>
    </div>
  </div>
</template>
