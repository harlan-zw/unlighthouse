<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'vue-sonner'

const router = useRouter()
const api = useApi()
const { scoreToColor, scoreToLabel } = useScoreColor()

const page = ref(1)
const pageSize = 20

const { data: scans, status, refresh } = useAsyncData(
  'scan-history',
  () => api['history.list']({ page: page.value, pageSize }).catch(() => null),
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

async function rescanFromHistory(scanId: string) {
  try {
    const result = await api['history.rescan']({ scanId })
    toast.success('Rescan started')
    router.push(`/scan/${result.scanId}/overview`)
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err.message })
  }
}

async function deleteScan(scanId: string) {
  try {
    await api['scan.delete']({ scanId })
    toast.success('Scan deleted')
    refresh()
  }
  catch (err: any) {
    toast.error('Failed to delete', { description: err.message })
  }
}

const totalPages = computed(() => {
  if (!scans.value) return 0
  return Math.ceil(scans.value.total / pageSize)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">History</h1>
        <p class="text-sm text-muted-foreground">All past scan results.</p>
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
              <TableHead class="w-16">Mode</TableHead>
              <TableHead class="w-20">Device</TableHead>
              <TableHead class="w-24">Status</TableHead>
              <TableHead class="w-16 text-center">Score</TableHead>
              <TableHead class="w-16 text-right">Routes</TableHead>
              <TableHead class="w-20 text-right">Duration</TableHead>
              <TableHead class="w-40">Date</TableHead>
              <TableHead class="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="scan in scans.items"
              :key="scan.scanId"
              class="cursor-pointer"
              @click="router.push(`/scan/${scan.scanId}/overview`)"
            >
              <TableCell class="font-medium text-sm truncate max-w-xs">{{ scan.site }}</TableCell>
              <TableCell>
                <Badge :variant="scan.mode === 'page' ? 'secondary' : 'outline'" class="text-[10px]">
                  {{ scan.mode === 'page' ? 'Page' : 'Site' }}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-[10px]">{{ scan.device }}</Badge>
              </TableCell>
              <TableCell>
                <ScanStatusBadge :status="scan.status" />
              </TableCell>
              <TableCell class="text-center">
                <span
                  v-if="scan.summary?.scoreAverage != null"
                  class="font-bold tabular-nums text-sm"
                  :class="scoreToColor(scan.summary.scoreAverage)"
                >
                  {{ scoreToLabel(scan.summary.scoreAverage) }}
                </span>
                <span v-else class="text-muted-foreground text-xs">—</span>
              </TableCell>
              <TableCell class="text-right tabular-nums text-sm">
                {{ scan.summary?.routes ?? '—' }}
              </TableCell>
              <TableCell class="text-right tabular-nums text-xs text-muted-foreground">
                {{ formatDuration(scan.startedAt, scan.completedAt) }}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">
                {{ formatDate(scan.startedAt) }}
              </TableCell>
              <TableCell @click.stop class="flex items-center gap-0.5">
                <Button
                  v-if="scan.status === 'complete'"
                  variant="ghost"
                  size="sm"
                  class="size-7 p-0 text-muted-foreground hover:text-foreground"
                  title="Rescan"
                  @click="rescanFromHistory(scan.scanId)"
                >
                  <Icon name="lucide:refresh-cw" class="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger as-child>
                    <Button variant="ghost" size="sm" class="size-7 p-0 text-muted-foreground hover:text-destructive">
                      <Icon name="lucide:trash-2" class="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete scan?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this scan and all its data. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction @click="deleteScan(scan.scanId)">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
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
