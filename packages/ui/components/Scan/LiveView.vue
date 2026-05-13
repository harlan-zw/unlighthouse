<script setup lang="ts">
import { useScan } from '~/composables/scan'
import { useUnlighthouseConfig } from '~/composables/useUnlighthouseConfig'

const { website } = useUnlighthouseConfig()

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
} = useScan()

const displayWebsite = computed(() => scanState.site || website.value)
const hasPartialResults = computed(() => scanState.progress.scanned > 0 || scanState.recentlyCompleted.length > 0)

const showCancelConfirm = ref(false)

const statusConfig = {
  idle: { label: 'Idle', icon: 'i-heroicons-pause-circle', color: 'text-muted' },
  starting: { label: 'Starting...', icon: 'i-heroicons-play-circle', color: 'text-primary' },
  discovering: { label: 'Discovering routes', icon: 'i-heroicons-magnifying-glass', color: 'text-info' },
  scanning: { label: 'Scanning', icon: 'i-heroicons-bolt', color: 'text-primary' },
  paused: { label: 'Paused', icon: 'i-heroicons-pause-circle', color: 'text-warning' },
  complete: { label: 'Complete', icon: 'i-heroicons-check-circle', color: 'text-success' },
  cancelled: { label: 'Cancelled', icon: 'i-heroicons-x-circle', color: 'text-error' },
  error: { label: 'Error', icon: 'i-heroicons-exclamation-triangle', color: 'text-error' },
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
  navigateTo('/')
}

watch(isScanComplete, (complete) => {
  if (complete)
    setTimeout(navigateTo, 2000, `/results/${scanId.value}`)
})

function extractDomain(url: string) {
  try { return new URL(url).hostname }
  catch { return url }
}
</script>

<template>
  <div>
    <header class="mb-8 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">
          Live scan
        </h1>
        <p v-if="displayWebsite" class="text-sm text-muted mt-1 font-mono">
          {{ extractDomain(displayWebsite) }}
        </p>
      </div>
      <div
        class="flex items-center gap-2 px-3 py-1.5 rounded-full ring-1"
        :class="isScanning ? 'bg-primary/10 ring-primary/20' : isScanComplete ? 'bg-success/10 ring-success/20' : 'bg-elevated/60 ring-default'"
      >
        <UIcon :name="currentStatus.icon" class="w-4 h-4" :class="currentStatus.color" />
        <span class="text-sm" :class="currentStatus.color">{{ currentStatus.label }}</span>
      </div>
    </header>

    <main class="max-w-4xl mx-auto">
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
              class="text-highlighted/5"
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
              class="text-primary transition-all duration-500"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-4xl font-bold font-mono text-primary">{{ Math.round(scanProgressPercent) }}%</span>
            <span class="text-sm text-dimmed mt-1">{{ scanState.progress.scanned }} / {{ scanState.progress.discovered }}</span>
          </div>
        </div>

        <div class="text-center mb-6">
          <h1 class="text-2xl font-semibold mb-2">
            <span v-if="scanState.paused">Scan paused</span>
            <span v-else-if="isScanning">Auditing routes</span>
            <span v-else-if="isScanComplete">Scan complete</span>
            <span v-else-if="scanState.status === 'cancelled'">Scan cancelled</span>
            <span v-else-if="scanState.status === 'error'">Scan failed</span>
            <span v-else>Waiting to start</span>
          </h1>
          <p v-if="scanState.currentUrl && !scanState.error" class="text-sm text-muted font-mono truncate max-w-md">
            {{ scanState.currentUrl }}
          </p>
        </div>

        <div v-if="scanState.status === 'error'" class="mb-8 max-w-md mx-auto">
          <div class="bg-error/10 border border-error/20 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-error mt-0.5 shrink-0" />
              <div>
                <h3 class="font-medium text-error mb-1">
                  Scan failed
                </h3>
                <p class="text-sm text-muted font-mono">
                  {{ scanState.error || 'Worker exited before completion. Check server logs and retry.' }}
                </p>
              </div>
            </div>
          </div>
          <div class="flex justify-center gap-3 mt-4">
            <UButton
              color="primary"
              icon="i-heroicons-arrow-path"
              @click="retryScan"
            >
              Run scan
            </UButton>
            <UButton
              v-if="hasPartialResults"
              color="neutral"
              variant="outline"
              icon="i-heroicons-chart-bar"
              @click="goToResults"
            >
              View partial results
            </UButton>
            <UButton
              v-else
              color="neutral"
              variant="outline"
              icon="i-heroicons-home"
              @click="navigateTo('/sites/add')"
            >
              Add site
            </UButton>
          </div>
        </div>

        <div class="flex gap-8 mb-8">
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold">
              {{ scanState.progress.discovered }}
            </div>
            <div class="text-xs text-dimmed uppercase tracking-wider">
              Discovered
            </div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold text-success">
              {{ scanState.progress.scanned }}
            </div>
            <div class="text-xs text-dimmed uppercase tracking-wider">
              Scanned
            </div>
          </div>
          <div v-if="scanState.progress.failed > 0" class="text-center">
            <div class="text-2xl font-mono font-semibold text-error">
              {{ scanState.progress.failed }}
            </div>
            <div class="text-xs text-dimmed uppercase tracking-wider">
              Failed
            </div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-semibold">
              {{ formatTimeRemaining(scanState.estimatedTimeRemaining) }}
            </div>
            <div class="text-xs text-dimmed uppercase tracking-wider">
              Remaining
            </div>
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
            Preview results
          </UButton>
          <UButton
            v-if="isScanComplete || scanState.status === 'cancelled'"
            color="primary"
            icon="i-heroicons-chart-bar"
            @click="goToResults"
          >
            {{ hasPartialResults ? 'View partial results' : 'View report' }}
          </UButton>
        </div>
      </div>

      <div v-if="scanState.recentlyCompleted.length > 0" class="bg-elevated/40 border border-default rounded-xl p-6">
        <h2 class="text-sm font-medium text-muted uppercase tracking-wider mb-4">
          Recently completed
        </h2>
        <div class="space-y-2">
          <div
            v-for="(completedRoute, idx) in scanState.recentlyCompleted"
            :key="completedRoute.path + idx"
            class="flex items-center justify-between py-2 px-3 rounded-lg bg-elevated/40 hover:bg-elevated/80 transition-colors"
          >
            <span class="font-mono text-sm text-toned truncate flex-1">{{ completedRoute.path }}</span>
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

      <div v-else-if="isScanning" class="space-y-2 py-4">
        <USkeleton v-for="n in 4" :key="n" class="h-10 w-full rounded-lg" :class="`opacity-${100 - n * 15}`" />
      </div>
    </main>

    <UModal v-model:open="showCancelConfirm" title="Cancel scan?">
      <template #body>
        <p class="text-muted p-4">
          Cancel the active scan? Completed routes will stay available, but unfinished work will stop and a fresh scan will start from zero.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 p-4">
          <UButton variant="ghost" color="neutral" @click="showCancelConfirm = false">
            Keep scanning
          </UButton>
          <UButton color="error" @click="confirmCancel">
            Cancel scan
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
