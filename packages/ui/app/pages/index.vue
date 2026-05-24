<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { useScanStore } from '~/stores/scan'

const api = useApi()
const router = useRouter()
const store = useScanStore()

const { data: scans, status: historyStatus } = useAsyncData('recent-scans', async () => {
  try {
    return await api['history.list']({ page: 1, pageSize: 10 })
  }
  catch {
    return null
  }
})

watch(
  () => store.scanId,
  (scanId) => {
    if (scanId && store.isActive) {
      router.push(`/scan/${scanId}/overview`)
    }
  },
  { immediate: true },
)

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p class="text-muted-foreground">
          Start a new scan or view past results.
        </p>
      </div>
      <Button as-child>
        <NuxtLink to="/scan/new">
          <Icon name="lucide:plus" class="size-4 mr-2" />
          New Scan
        </NuxtLink>
      </Button>
    </div>

    <div v-if="historyStatus === 'pending'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 3" :key="i">
        <CardHeader>
          <div class="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div class="h-3 w-1/2 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
      </Card>
    </div>

    <div v-else-if="!scans?.items?.length" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="size-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon name="lucide:scan" class="size-8 text-muted-foreground" />
      </div>
      <h2 class="text-lg font-semibold mb-2">
        No scans yet
      </h2>
      <p class="text-muted-foreground mb-6 max-w-sm">
        Start your first scan to get SEO, performance, and accessibility insights.
      </p>
      <Button size="lg" as-child>
        <NuxtLink to="/scan/new">
          <Icon name="lucide:plus" class="size-4 mr-2" />
          Start First Scan
        </NuxtLink>
      </Button>
    </div>

    <div v-else class="space-y-4">
      <h2 class="text-lg font-semibold">
        Recent Scans
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="scan in scans.items"
          :key="scan.scanId"
          class="cursor-pointer transition-colors hover:bg-muted/50"
          @click="router.push(`/scan/${scan.scanId}/overview`)"
        >
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <CardTitle class="text-sm font-medium truncate max-w-[70%]">
                {{ scan.site }}
              </CardTitle>
              <ScanStatusBadge :status="scan.status" />
            </div>
            <CardDescription class="text-xs">
              {{ formatDate(scan.startedAt) }}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-3">
              <Badge variant="outline" class="text-xs">
                <Icon name="lucide:smartphone" v-if="scan.device === 'mobile'" class="size-3 mr-1" />
                <Icon name="lucide:monitor" v-else class="size-3 mr-1" />
                {{ scan.device }}
              </Badge>
              <span v-if="scan.summary" class="text-xs text-muted-foreground">
                {{ scan.summary.routes }} routes
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
