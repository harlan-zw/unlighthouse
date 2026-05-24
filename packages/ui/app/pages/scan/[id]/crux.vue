<script setup lang="ts">
import type { CruxData } from '@unlighthouse/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string

const { data: cruxPack, status } = useAsyncData(
  `crux-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'crux' }).catch(() => null),
)

const data = computed<CruxData | null>(() => (cruxPack.value as any)?.report ?? null)

const activeDevice = ref<'phone' | 'desktop'>('phone')

const metrics = [
  { key: 'lcp' as const, label: 'Largest Contentful Paint', unit: 'ms', good: 2500, poor: 4000 },
  { key: 'inp' as const, label: 'Interaction to Next Paint', unit: 'ms', good: 200, poor: 500 },
  { key: 'cls' as const, label: 'Cumulative Layout Shift', unit: '', good: 0.1, poor: 0.25 },
]

function formatValue(value: number, unit: string) {
  if (unit === 'ms') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  }
  return value.toFixed(3)
}

function metricColor(value: number, good: number, poor: number) {
  if (value <= good) return 'text-green-500'
  if (value <= poor) return 'text-orange-500'
  return 'text-red-500'
}

function metricBg(value: number, good: number, poor: number) {
  if (value <= good) return 'bg-green-500'
  if (value <= poor) return 'bg-orange-500'
  return 'bg-red-500'
}

function getDeviceData(d: CruxData) {
  return activeDevice.value === 'phone' ? d.phone : d.desktop
}

function latestValue(entries: Array<{ value: number }>) {
  if (!entries.length) return null
  return entries[entries.length - 1].value
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/scan/${scanId}/overview`">
          <Icon name="lucide:arrow-left" class="size-4 mr-1" />
          Overview
        </NuxtLink>
      </Button>
      <h1 class="text-xl font-bold tracking-tight">CrUX Field Data</h1>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">Loading CrUX data...</div>

    <div v-else-if="!data || (!data.phone.lcp.length && !data.desktop.lcp.length)" class="text-center py-12 text-muted-foreground">
      <Icon name="lucide:globe" class="size-12 mx-auto mb-3 opacity-50" />
      <p>No CrUX field data available for this site.</p>
      <p class="text-xs mt-1">Field data requires the site to have enough traffic in Chrome User Experience Report.</p>
    </div>

    <template v-else>
      <div v-if="data.hostname" class="text-sm text-muted-foreground">
        Origin: <span class="font-medium text-foreground">{{ data.hostname }}</span>
      </div>

      <Tabs v-model="activeDevice" class="w-full">
        <TabsList>
          <TabsTrigger value="phone">
            <Icon name="lucide:smartphone" class="size-4 mr-1.5" />
            Phone
          </TabsTrigger>
          <TabsTrigger value="desktop">
            <Icon name="lucide:monitor" class="size-4 mr-1.5" />
            Desktop
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="grid gap-4 lg:grid-cols-3">
        <Card v-for="m in metrics" :key="m.key">
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">{{ m.label }}</CardTitle>
          </CardHeader>
          <CardContent>
            <template v-if="getDeviceData(data)[m.key].length">
              <!-- Current value -->
              <div class="mb-4">
                <div
                  class="text-3xl font-bold tabular-nums"
                  :class="metricColor(latestValue(getDeviceData(data)[m.key])!, m.good, m.poor)"
                >
                  {{ formatValue(latestValue(getDeviceData(data)[m.key])!, m.unit) }}
                </div>
                <div class="text-xs text-muted-foreground">Current (p75)</div>
              </div>

              <!-- Distribution bar (last entry) -->
              <div v-if="getDeviceData(data)[m.key].at(-1)?.good != null" class="mb-3">
                <div class="flex h-2.5 rounded-full overflow-hidden">
                  <div
                    class="bg-green-500"
                    :style="{ width: `${(getDeviceData(data)[m.key].at(-1)!.good || 0) * 100}%` }"
                  />
                  <div
                    class="bg-orange-500"
                    :style="{ width: `${(getDeviceData(data)[m.key].at(-1)!.ni || 0) * 100}%` }"
                  />
                  <div
                    class="bg-red-500"
                    :style="{ width: `${(getDeviceData(data)[m.key].at(-1)!.poor || 0) * 100}%` }"
                  />
                </div>
                <div class="flex justify-between mt-1 text-[10px] text-muted-foreground">
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
              <div class="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>{{ getDeviceData(data)[m.key].length }} weeks</span>
                <span>latest →</span>
              </div>
            </template>
            <div v-else class="text-sm text-muted-foreground py-4 text-center">
              No data
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
