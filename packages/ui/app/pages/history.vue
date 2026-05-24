<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

const router = useRouter()
const api = useApi()
const { scoreToColor, scoreToLabel } = useScoreColor()

const page = ref(1)
const pageSize = 20

const { data: scans, status, refresh } = useAsyncData(
  'scan-history',
  () => api['history.list']({ page: page.value, pageSize }),
  { watch: [page] },
)

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string | null, end: string | null) {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60000)}m`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          History
        </h1>
        <p class="text-muted-foreground">
          Past scan results.
        </p>
      </div>
      <Button as-child>
        <NuxtLink to="/scan/new">
          <Icon name="lucide:plus" class="size-4 mr-2" />
          New Scan
        </NuxtLink>
      </Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div v-if="status === 'pending'" class="p-6 space-y-3">
          <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
        </div>

        <div v-else-if="!scans?.items?.length" class="flex flex-col items-center justify-center py-16 text-center">
          <Icon name="lucide:history" class="size-12 text-muted-foreground/50 mb-4" />
          <p class="text-muted-foreground">No scan history found.</p>
        </div>

        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead class="w-24">Device</TableHead>
              <TableHead class="w-28">Status</TableHead>
              <TableHead class="w-20 text-right">Score</TableHead>
              <TableHead class="w-20 text-right">Routes</TableHead>
              <TableHead class="w-20 text-right">Duration</TableHead>
              <TableHead class="w-40">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="scan in scans.items"
              :key="scan.scanId"
              class="cursor-pointer"
              @click="router.push(`/scan/${scan.scanId}/overview`)"
            >
              <TableCell class="font-medium truncate max-w-xs">
                {{ scan.site }}
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-xs">
                  {{ scan.device }}
                </Badge>
              </TableCell>
              <TableCell>
                <ScanStatusBadge :status="scan.status" />
              </TableCell>
              <TableCell class="text-right">
                <span
                  v-if="scan.summary?.scoreAverage !== undefined"
                  class="font-bold tabular-nums"
                  :class="scoreToColor(scan.summary.scoreAverage)"
                >
                  {{ scoreToLabel(scan.summary.scoreAverage) }}
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ scan.summary?.routes ?? '—' }}
              </TableCell>
              <TableCell class="text-right tabular-nums text-xs">
                {{ formatDuration(scan.startedAt, scan.completedAt) }}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">
                {{ formatDate(scan.startedAt) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <div v-if="scans && scans.total > pageSize" class="flex justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        :disabled="page <= 1"
        @click="page--"
      >
        Previous
      </Button>
      <span class="flex items-center text-sm text-muted-foreground px-3">
        Page {{ page }} of {{ Math.ceil(scans.total / pageSize) }}
      </span>
      <Button
        variant="outline"
        size="sm"
        :disabled="page >= Math.ceil(scans.total / pageSize)"
        @click="page++"
      >
        Next
      </Button>
    </div>
  </div>
</template>
