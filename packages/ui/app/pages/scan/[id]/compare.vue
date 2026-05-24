<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'vue-sonner'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string
const { scoreToColor, scoreToLabel } = useScoreColor()

const baseScanId = ref<string>('')
const comparing = ref(false)

const { data: scanMeta } = useAsyncData(
  `compare-meta-${scanId}`,
  () => api['scan.meta']({ scanId }).catch(() => null),
)

const { data: history } = useAsyncData(
  `compare-history`,
  () => api['history.list']({ page: 1, pageSize: 50 }).catch(() => null),
)

const otherScans = computed(() => {
  if (!history.value?.items) return []
  return history.value.items.filter(s => s.scanId !== scanId && s.status === 'complete')
})

// Auto-find previous scan
const { data: autoBase } = useAsyncData(
  `compare-auto-${scanId}`,
  async () => {
    if (!scanMeta.value) return null
    try {
      const res = await api['compare.findPrevious']({
        site: scanMeta.value.site,
        device: scanMeta.value.device,
        excludeScanId: scanId,
      })
      return res.scanId
    }
    catch { return null }
  },
  { watch: [scanMeta] },
)

watch(autoBase, (id) => {
  if (id && !baseScanId.value) baseScanId.value = id
})

const { data: report, refresh: runCompare } = useAsyncData(
  `compare-report-${scanId}`,
  async () => {
    if (!baseScanId.value) return null
    comparing.value = true
    try {
      return await api['compare.run']({
        baseScanId: baseScanId.value,
        currentScanId: scanId,
      })
    }
    catch (err: any) {
      toast.error('Compare failed', { description: err.message })
      return null
    }
    finally {
      comparing.value = false
    }
  },
  { immediate: false },
)

function handleCompare() {
  if (!baseScanId.value) return
  runCompare()
}

function formatDelta(delta: number, metric: string) {
  if (['performance', 'accessibility', 'seo', 'best-practices'].includes(metric)) {
    const pct = (delta * 100).toFixed(1)
    return delta > 0 ? `+${pct}` : pct
  }
  if (Math.abs(delta) >= 1000) return `${delta > 0 ? '+' : ''}${(delta / 1000).toFixed(1)}s`
  return `${delta > 0 ? '+' : ''}${Math.round(delta)}ms`
}

function findScanLabel(id: string) {
  const scan = history.value?.items?.find(s => s.scanId === id)
  if (!scan) return id.slice(0, 8)
  return `${scan.site} — ${new Date(scan.startedAt).toLocaleDateString()}`
}

const markdownLoading = ref(false)
const markdownContent = ref('')
const showMarkdown = ref(false)

async function exportMarkdown() {
  if (!baseScanId.value) return
  markdownLoading.value = true
  try {
    const result = await api['compare.markdown']({
      baseScanId: baseScanId.value,
      currentScanId: scanId,
    })
    markdownContent.value = result.markdown
    showMarkdown.value = true
  }
  catch (err: any) {
    toast.error('Export failed', { description: err.message })
  }
  finally {
    markdownLoading.value = false
  }
}

async function copyMarkdown() {
  await navigator.clipboard.writeText(markdownContent.value)
  toast.success('Copied to clipboard')
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
      <h1 class="text-xl font-bold tracking-tight">Compare</h1>
    </div>

    <!-- Scan selector -->
    <Card>
      <CardContent class="pt-5 pb-5">
        <div class="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div class="flex-1 space-y-2 w-full">
            <label class="text-sm font-medium">Compare against</label>
            <Select v-model="baseScanId">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Select a previous scan..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="scan in otherScans" :key="scan.scanId" :value="scan.scanId">
                  <div class="flex items-center gap-2">
                    <span class="truncate">{{ scan.site }}</span>
                    <Badge variant="outline" class="text-[10px]">{{ scan.device }}</Badge>
                    <span class="text-xs text-muted-foreground">{{ new Date(scan.startedAt).toLocaleDateString() }}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="autoBase" class="text-xs text-muted-foreground">
              Auto-selected previous scan for same site/device.
            </p>
          </div>
          <Button :disabled="!baseScanId || comparing" @click="handleCompare">
            <Icon v-if="comparing" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
            <Icon v-else name="lucide:git-compare-arrows" class="size-4 mr-2" />
            Compare
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Results -->
    <template v-if="report">
      <!-- Summary cards -->
      <div class="grid gap-4 sm:grid-cols-2">
        <Card :class="report.regressions.length ? 'border-red-500/30' : 'border-green-500/30'">
          <CardContent class="pt-5 pb-5 flex items-center gap-4">
            <div class="flex size-12 items-center justify-center rounded-full" :class="report.regressions.length ? 'bg-red-500/10' : 'bg-green-500/10'">
              <Icon :name="report.regressions.length ? 'lucide:trending-down' : 'lucide:check'" :class="report.regressions.length ? 'text-red-500' : 'text-green-500'" class="size-6" />
            </div>
            <div>
              <div class="text-2xl font-bold">{{ report.regressions.length }}</div>
              <div class="text-sm text-muted-foreground">Regressions</div>
            </div>
          </CardContent>
        </Card>
        <Card class="border-green-500/30">
          <CardContent class="pt-5 pb-5 flex items-center gap-4">
            <div class="flex size-12 items-center justify-center rounded-full bg-green-500/10">
              <Icon name="lucide:trending-up" class="size-6 text-green-500" />
            </div>
            <div>
              <div class="text-2xl font-bold">{{ report.improvements.length }}</div>
              <div class="text-sm text-muted-foreground">Improvements</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Regressions -->
      <Card v-if="report.regressions.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-red-500 flex items-center gap-2">
            <Icon name="lucide:trending-down" class="size-4" />
            Regressions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead class="w-28">Metric</TableHead>
                <TableHead class="w-20 text-right">Base</TableHead>
                <TableHead class="w-20 text-right">Current</TableHead>
                <TableHead class="w-24 text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(diff, i) in report.regressions" :key="i">
                <TableCell class="font-mono text-xs truncate max-w-xs">{{ diff.url }}</TableCell>
                <TableCell>
                  <Badge variant="outline" class="text-[10px] capitalize">{{ diff.metric }}</Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm">
                  {{ diff.base != null ? (['performance','accessibility','seo','best-practices'].includes(diff.metric) ? Math.round(diff.base * 100) : Math.round(diff.base)) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm">
                  {{ diff.current != null ? (['performance','accessibility','seo','best-practices'].includes(diff.metric) ? Math.round(diff.current * 100) : Math.round(diff.current)) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm font-medium text-red-500">
                  {{ formatDelta(diff.delta, diff.metric) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Improvements -->
      <Card v-if="report.improvements.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-green-500 flex items-center gap-2">
            <Icon name="lucide:trending-up" class="size-4" />
            Improvements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead class="w-28">Metric</TableHead>
                <TableHead class="w-20 text-right">Base</TableHead>
                <TableHead class="w-20 text-right">Current</TableHead>
                <TableHead class="w-24 text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(diff, i) in report.improvements" :key="i">
                <TableCell class="font-mono text-xs truncate max-w-xs">{{ diff.url }}</TableCell>
                <TableCell>
                  <Badge variant="outline" class="text-[10px] capitalize">{{ diff.metric }}</Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm">
                  {{ diff.base != null ? (['performance','accessibility','seo','best-practices'].includes(diff.metric) ? Math.round(diff.base * 100) : Math.round(diff.base)) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm">
                  {{ diff.current != null ? (['performance','accessibility','seo','best-practices'].includes(diff.metric) ? Math.round(diff.current * 100) : Math.round(diff.current)) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm font-medium text-green-500">
                  {{ formatDelta(diff.delta, diff.metric) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="!report.regressions.length && !report.improvements.length" class="text-center py-12 text-muted-foreground">
        No differences found between the two scans.
      </div>

      <!-- Export -->
      <div class="flex justify-end">
        <Button variant="outline" :disabled="markdownLoading" @click="exportMarkdown">
          <Icon v-if="markdownLoading" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:file-text" class="size-4 mr-2" />
          Export as Markdown
        </Button>
      </div>
    </template>

    <!-- Markdown dialog -->
    <Dialog v-model:open="showMarkdown">
      <DialogContent class="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            PR Comment
            <Button size="sm" variant="outline" @click="copyMarkdown">
              <Icon name="lucide:copy" class="size-3.5 mr-1" />
              Copy
            </Button>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea class="h-[60vh]">
          <pre class="text-xs font-mono whitespace-pre-wrap break-all p-4 bg-muted rounded-lg">{{ markdownContent }}</pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </div>
</template>
