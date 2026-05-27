<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useScanStore } from '~/stores/scan'

const api = useApi()
const router = useRouter()
const store = useScanStore()
const { scoreToColor, scoreToLabel, scoreToRingColor } = useScoreColor()

const { data: scans, status: historyStatus } = useAsyncData('recent-scans', async () => {
  try {
    return await api['history.list']({ page: 1, pageSize: 12 })
  }
  catch {
    return null
  }
})

const { data: sitesData } = useAsyncData('dashboard-sites', async () => {
  try {
    return await api['sites.list']({})
  }
  catch {
    return { sites: [] }
  }
})

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string | null, end: string | null) {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60000)}m`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p class="text-sm text-muted-foreground">Start a new scan or view past results.</p>
      </div>
      <Button as-child>
        <NuxtLink to="/scan/new">
          <Icon name="lucide:plus" class="size-4 mr-2" />
          New Scan
        </NuxtLink>
      </Button>
    </div>

    <!-- Active scan banner -->
    <Card v-if="store.isActive" class="border-primary/50 bg-primary/5 cursor-pointer" @click="router.push(`/scan/${store.scanId}/overview`)">
      <CardContent class="pt-4 pb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="relative flex size-2">
              <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span class="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span class="text-sm font-medium">Scanning {{ store.site }}</span>
          </div>
          <span class="text-sm tabular-nums text-muted-foreground">{{ store.scanned }}/{{ store.total }}</span>
        </div>
        <Progress :model-value="store.percent" class="h-1.5" />
      </CardContent>
    </Card>

    <!-- Loading skeleton -->
    <div v-if="historyStatus === 'pending'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 3" :key="i">
        <CardHeader>
          <div class="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div class="h-3 w-1/2 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
      </Card>
    </div>

    <!-- Empty state -->
    <div v-else-if="!scans?.items?.length && !store.isActive" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="size-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon name="lucide:radar" class="size-8 text-muted-foreground" />
      </div>
      <h2 class="text-lg font-semibold mb-2">No scans yet</h2>
      <p class="text-muted-foreground mb-6 max-w-sm">
        Start your first scan to get SEO, performance, and accessibility insights for your website.
      </p>
      <Button size="lg" as-child>
        <NuxtLink to="/scan/new">
          <Icon name="lucide:plus" class="size-4 mr-2" />
          Start First Scan
        </NuxtLink>
      </Button>
    </div>

    <!-- Sites -->
    <div v-if="sitesData?.sites?.length" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Sites</h2>
        <NuxtLink to="/sites" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Manage
          <Icon name="lucide:arrow-right" class="size-3 inline ml-0.5" />
        </NuxtLink>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          v-for="site in sitesData.sites.slice(0, 8)"
          :key="site.id"
          class="cursor-pointer transition-all hover:border-primary/30 hover:shadow-sm"
          @click="router.push({ path: '/scan/new', query: { url: site.url } })"
        >
          <CardContent class="pt-4 pb-3">
            <div class="mb-1">
              <span class="text-sm font-medium truncate">{{ site.name }}</span>
            </div>
            <div class="text-xs text-muted-foreground font-mono truncate">{{ site.url }}</div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Recent scans -->
    <div v-if="scans?.items?.length" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Recent Scans</h2>
        <NuxtLink to="/history" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
          View all
          <Icon name="lucide:arrow-right" class="size-3 inline ml-0.5" />
        </NuxtLink>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="scan in scans.items"
          :key="scan.scanId"
          class="cursor-pointer transition-all hover:border-primary/30 hover:shadow-sm group"
          @click="router.push(`/scan/${scan.scanId}/overview`)"
        >
          <CardContent class="pt-4 pb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium truncate max-w-[65%]">{{ scan.site }}</span>
              <ScanStatusBadge :status="scan.status" />
            </div>

            <!-- Score bar -->
            <div v-if="scan.summary?.scoreAverage != null" class="flex items-center gap-3 mb-3">
              <ScoreRing :score="scan.summary.scoreAverage" size="sm" />
              <div>
                <div class="text-xl font-bold tabular-nums" :style="{ color: scoreToRingColor(scan.summary.scoreAverage) }">
                  {{ scoreToLabel(scan.summary.scoreAverage) }}
                </div>
                <div class="text-[10px] text-muted-foreground">avg score</div>
              </div>
            </div>

            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" class="text-[10px] px-1.5 py-0">
                <Icon :name="scan.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor'" class="size-2.5 mr-0.5" />
                {{ scan.device }}
              </Badge>
              <span v-if="scan.summary">{{ scan.summary.routes }} routes</span>
              <span v-if="formatDuration(scan.startedAt, scan.completedAt)" class="text-muted-foreground/60">
                {{ formatDuration(scan.startedAt, scan.completedAt) }}
              </span>
              <span class="ml-auto">{{ formatDate(scan.startedAt) }}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
