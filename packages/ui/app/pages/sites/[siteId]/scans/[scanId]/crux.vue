<script setup lang="ts">
import type { CruxData } from '@unlighthouse/contracts'
import { getScanId } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

const scanId = getScanId()

const { data: cruxPack, status, error: cruxError, refresh: refreshCrux } = useApiQuery('pack.run', () => ({ scanId, pack: 'crux' }))

const data = computed<CruxData | null>(() => (cruxPack.value as any)?.report ?? null)

const activeDevice = ref<'phone' | 'desktop'>('phone')

const metrics = ([
  { key: 'lcp' as const, label: 'Largest Contentful Paint', unit: 'ms' },
  { key: 'inp' as const, label: 'Interaction to Next Paint', unit: 'ms' },
  { key: 'cls' as const, label: 'Cumulative Layout Shift', unit: '' },
]).map(m => ({ ...m, good: CWV_THRESHOLDS[m.key][0], poor: CWV_THRESHOLDS[m.key][1] }))

function formatValue(value: number, unit: string) {
  return formatMetricValue(value, unit as 'ms' | '')
}

function metricColor(value: number, good: number, poor: number) {
  if (value <= good)
    return 'text-success'
  if (value <= poor)
    return 'text-warning'
  return 'text-error'
}

function metricBg(value: number, good: number, poor: number) {
  if (value <= good)
    return 'bg-success'
  if (value <= poor)
    return 'bg-warning'
  return 'bg-error'
}

// CrUX reports can come back partial — a device (or a metric series) may be
// absent when the origin lacks field data. Normalise to guaranteed arrays so
// the template never dereferences `undefined.lcp` (the crash this guards).
function getDeviceData(d: CruxData) {
  const dev = (activeDevice.value === 'phone' ? d.phone : d.desktop) as Partial<CruxData['phone']> | undefined
  return {
    lcp: dev?.lcp ?? [],
    inp: dev?.inp ?? [],
    cls: dev?.cls ?? [],
  }
}

function latestValue(entries: Array<{ value: number }>) {
  const last = entries[entries.length - 1]
  return last?.value ?? null
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader title="CrUX Field Data" flush />

    <QueryError v-if="cruxError" :error="cruxError" :on-retry="refreshCrux" />

    <div v-if="status === 'pending'" class="space-y-3 py-2">
      <UiLoadingState :rows="3" />
      <p class="text-xs text-muted text-center">
        Loading CrUX data...
      </p>
    </div>

    <UiEmptyState
      v-else-if="!data || (!data.phone?.lcp?.length && !data.desktop?.lcp?.length)"
      icon="globe"
      title="No CrUX field data available for this site."
      description="Field data requires the site to have enough traffic in Chrome User Experience Report."
    />

    <template v-else>
      <div v-if="data.hostname" class="text-sm text-muted">
        Origin: <span class="font-medium text-default">{{ data.hostname }}</span>
      </div>

      <UTabs
        v-model="activeDevice"
        :content="false"
        :items="[
          { value: 'phone', label: 'Phone', icon: 'smartphone' },
          { value: 'desktop', label: 'Desktop', icon: 'monitor' },
        ]"
        class="w-full"
      />

      <div class="grid gap-4 lg:grid-cols-3">
        <UiCard v-for="m in metrics" :key="m.key" size="sm">
          <template #header>
            <h3 class="text-label text-dimmed">
              {{ m.label }}
            </h3>
          </template>
          <template v-if="getDeviceData(data)[m.key].length">
            <!-- Current value -->
            <div class="mb-4">
              <div
                class="numerals-display text-3xl"
                :class="metricColor(latestValue(getDeviceData(data)[m.key])!, m.good, m.poor)"
              >
                {{ formatValue(latestValue(getDeviceData(data)[m.key])!, m.unit) }}
              </div>
              <div class="text-xs text-muted">
                Current (p75)
              </div>
            </div>

            <!-- Distribution bar (last entry) -->
            <div v-if="getDeviceData(data)[m.key].at(-1)?.good != null" class="mb-3">
              <div class="flex h-2.5 rounded-full overflow-hidden">
                <div
                  class="bg-success"
                  :style="{ width: `${(getDeviceData(data)[m.key].at(-1)!.good || 0) * 100}%` }"
                />
                <div
                  class="bg-warning"
                  :style="{ width: `${(getDeviceData(data)[m.key].at(-1)!.ni || 0) * 100}%` }"
                />
                <div
                  class="bg-error"
                  :style="{ width: `${(getDeviceData(data)[m.key].at(-1)!.poor || 0) * 100}%` }"
                />
              </div>
              <div class="flex justify-between mt-1 text-[10px] text-muted">
                <span>Good {{ ((getDeviceData(data)[m.key].at(-1)!.good || 0) * 100).toFixed(0) }}%</span>
                <span>NI {{ ((getDeviceData(data)[m.key].at(-1)!.ni || 0) * 100).toFixed(0) }}%</span>
                <span>Poor {{ ((getDeviceData(data)[m.key].at(-1)!.poor || 0) * 100).toFixed(0) }}%</span>
              </div>
            </div>

            <!-- History sparkline (simple bar chart) -->
            <div class="flex items-end gap-px h-12">
              <div
                v-for="(entry, i) in getDeviceData(data)[m.key].slice(-28)"
                :key="i"
                class="flex-1 rounded-t-sm min-w-[3px] transition-all"
                :class="metricBg(entry.value, m.good, m.poor)"
                :style="{ height: `${Math.max(4, Math.min(100, (entry.value / (m.poor * 1.5)) * 100))}%` }"
                :title="`${formatValue(entry.value, m.unit)} — ${new Date(entry.time).toLocaleDateString()}`"
              />
            </div>
            <div class="flex justify-between mt-1 text-[10px] text-muted">
              <span>{{ getDeviceData(data)[m.key].length }} weeks</span>
              <span>latest →</span>
            </div>
          </template>
          <div v-else class="text-sm text-muted py-4 text-center">
            No data
          </div>
        </UiCard>
      </div>
    </template>
  </div>
</template>
