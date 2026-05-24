<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useScanStore } from '~/stores/scan'

const route = useRoute()
const router = useRouter()
const api = useApi()
const store = useScanStore()
const scanId = computed(() => route.params.id as string)
const { scoreToColor, scoreToLabel } = useScoreColor()

const page = ref(1)
const pageSize = 50
const urlFilter = ref('')
const sortKey = ref('score-asc')

const sortOptions = [
  { value: 'score-asc', label: 'Score (low to high)' },
  { value: 'score-desc', label: 'Score (high to low)' },
  { value: 'lcp-desc', label: 'LCP (slowest)' },
  { value: 'lcp-asc', label: 'LCP (fastest)' },
  { value: 'url-asc', label: 'URL (A-Z)' },
]

const { data: scanResults, refresh } = useAsyncData(
  `scan-routes-${scanId.value}`,
  () => api['scan.results']({
    scanId: scanId.value,
    page: page.value,
    pageSize,
    sort: sortKey.value as any,
    filter: urlFilter.value ? { urlPattern: urlFilter.value } : undefined,
  }).catch(() => null),
  { watch: [scanId, page, sortKey, urlFilter] },
)

const { $ws } = useNuxtApp()
const ws = $ws as any
onMounted(() => ws.on('scan:complete', refresh))
onUnmounted(() => ws.off('scan:complete', refresh))

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null) return '—'
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

const totalPages = computed(() => {
  if (!scanResults.value) return 0
  return Math.ceil(scanResults.value.total / pageSize)
})

let filterTimeout: ReturnType<typeof setTimeout>
function onFilterInput(e: Event) {
  clearTimeout(filterTimeout)
  filterTimeout = setTimeout(() => {
    urlFilter.value = (e.target as HTMLInputElement).value
    page.value = 1
  }, 300)
}

function openRoute(r: any) {
  router.push(`/scan/${scanId.value}/route/${encodeURIComponent(r.path || r.url)}`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/scan/${scanId}/overview`">
          <Icon name="lucide:arrow-left" class="size-4 mr-1" />
          Overview
        </NuxtLink>
      </Button>
      <h1 class="text-xl font-bold tracking-tight">Routes</h1>
      <Badge v-if="scanResults" variant="secondary" class="text-xs">{{ scanResults.total }} total</Badge>
    </div>

    <div class="flex items-center gap-3">
      <div class="relative flex-1 max-w-sm">
        <Icon name="lucide:search" class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Filter by URL..." class="pl-8" :model-value="urlFilter" @input="onFilterInput" />
      </div>
      <Select v-model="sortKey">
        <SelectTrigger class="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Card>
      <CardContent class="p-0">
        <div v-if="scanResults?.items?.length" class="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="min-w-[200px]">Path</TableHead>
                <TableHead class="w-16 text-center">Perf</TableHead>
                <TableHead class="w-16 text-center">A11y</TableHead>
                <TableHead class="w-16 text-center">SEO</TableHead>
                <TableHead class="w-16 text-center">BP</TableHead>
                <TableHead class="w-20 text-right">LCP</TableHead>
                <TableHead class="w-16 text-right">CLS</TableHead>
                <TableHead class="w-20 text-right">TBT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="r in scanResults.items"
                :key="r.url + r.device"
                class="cursor-pointer hover:bg-muted/50"
                @click="openRoute(r)"
              >
                <TableCell class="font-mono text-xs">
                  <div class="truncate max-w-xs">{{ r.path || r.url }}</div>
                </TableCell>
                <TableCell class="text-center">
                  <span class="text-xs font-bold tabular-nums" :class="scoreToColor(r.scorePerformance)">{{ scoreToLabel(r.scorePerformance) }}</span>
                </TableCell>
                <TableCell class="text-center">
                  <span class="text-xs font-bold tabular-nums" :class="scoreToColor(r.scoreAccessibility)">{{ scoreToLabel(r.scoreAccessibility) }}</span>
                </TableCell>
                <TableCell class="text-center">
                  <span class="text-xs font-bold tabular-nums" :class="scoreToColor(r.scoreSeo)">{{ scoreToLabel(r.scoreSeo) }}</span>
                </TableCell>
                <TableCell class="text-center">
                  <span class="text-xs font-bold tabular-nums" :class="scoreToColor(r.scoreBestPractices)">{{ scoreToLabel(r.scoreBestPractices) }}</span>
                </TableCell>
                <TableCell class="text-right tabular-nums text-xs text-muted-foreground">{{ formatMetric(r.lcp) }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs text-muted-foreground">{{ formatMetric(r.cls, '') }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs text-muted-foreground">{{ formatMetric(r.tbt) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="text-center py-12 text-muted-foreground">
          <p v-if="store.isActive">Routes will appear as they are scanned...</p>
          <p v-else>No routes found.</p>
        </div>
      </CardContent>
    </Card>

    <div v-if="totalPages > 1" class="flex items-center justify-between">
      <span class="text-sm text-muted-foreground">Page {{ page }} of {{ totalPages }}</span>
      <div class="flex gap-1">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">
          <Icon name="lucide:chevron-left" class="size-4" />
        </Button>
        <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">
          <Icon name="lucide:chevron-right" class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
