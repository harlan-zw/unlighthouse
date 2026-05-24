<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'vue-sonner'

const route = useRoute()
const scanId = route.params.id as string
const routePath = decodeURIComponent(route.params.path as string)
const api = useApi()
const { scoreToColor, scoreToLabel, scoreToRingColor } = useScoreColor()

const rescanning = ref(false)
const selectedCategory = ref<string | null>(null)

async function rescanRoute() {
  rescanning.value = true
  try {
    await api['route.rescan']({ scanId, url: routeData.value?.route?.url || routePath })
    toast.success('Route rescan started')
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err.message })
  }
  finally {
    rescanning.value = false
  }
}

const { data: routeData, status } = useAsyncData(
  `route-detail-${scanId}-${routePath}`,
  async () => {
    try {
      return await api['route.get']({
        scanId,
        url: routePath.startsWith('http') ? routePath : `https://${routePath}`,
      })
    }
    catch {
      return null
    }
  },
)

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null) return '—'
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

const categoryIcons: Record<string, string> = {
  'performance': 'lucide:gauge',
  'accessibility': 'lucide:accessibility',
  'seo': 'lucide:search',
  'best-practices': 'lucide:shield-check',
  'agentic-browsing': 'lucide:bot',
}

const scores = computed(() => {
  if (!routeData.value?.categories) return []
  return routeData.value.categories.map((c: any) => ({
    id: c.id,
    label: c.title || c.id,
    score: c.score,
    auditCount: c.auditCount,
    passingCount: c.passingCount,
    failingCount: c.failingCount,
    icon: categoryIcons[c.id] || 'lucide:folder',
  }))
})

const metrics = computed(() => {
  if (!routeData.value?.route) return []
  const r = routeData.value.route
  return [
    { label: 'LCP', value: r.lcp, unit: 'ms', description: 'Largest Contentful Paint' },
    { label: 'CLS', value: r.cls, unit: '', description: 'Cumulative Layout Shift' },
    { label: 'TBT', value: r.tbt, unit: 'ms', description: 'Total Blocking Time' },
    { label: 'FCP', value: r.fcp, unit: 'ms', description: 'First Contentful Paint' },
    { label: 'SI', value: r.si, unit: 'ms', description: 'Speed Index' },
    { label: 'TTFB', value: r.ttfb, unit: 'ms', description: 'Time to First Byte' },
    { label: 'INP', value: r.inp, unit: 'ms', description: 'Interaction to Next Paint' },
  ]
})

const failingAudits = computed(() => {
  if (!routeData.value?.audits) return []
  return Object.entries(routeData.value.audits)
    .filter(([_, a]: [string, any]) => a.severity === 'fail' || a.severity === 'warn')
    .sort(([, a]: [string, any], [, b]: [string, any]) => {
      if (a.severity === 'fail' && b.severity !== 'fail') return -1
      if (a.severity !== 'fail' && b.severity === 'fail') return 1
      return (a.score ?? 0) - (b.score ?? 0)
    })
    .map(([id, a]: [string, any]) => ({ id, ...a }))
})

const filteredAudits = computed(() => {
  if (!selectedCategory.value) return failingAudits.value
  const categoryAudits = routeData.value?.categories?.find((c: any) => c.id === selectedCategory.value)
  if (!categoryAudits) return failingAudits.value
  return failingAudits.value
})

function metricColor(label: string, value: number | null): string {
  if (value === null) return 'text-muted-foreground'
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    CLS: [0.1, 0.25],
    TBT: [200, 600],
    FCP: [1800, 3000],
    SI: [3400, 5800],
    TTFB: [800, 1800],
    INP: [200, 500],
  }
  const [good, poor] = thresholds[label] || [Infinity, Infinity]
  if (value <= good) return 'text-green-500'
  if (value <= poor) return 'text-orange-500'
  return 'text-red-500'
}

function severityColor(severity: string): string {
  if (severity === 'fail') return 'destructive'
  if (severity === 'warn') return 'secondary'
  return 'outline'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/scan/${scanId}/routes`">
          <Icon name="lucide:arrow-left" class="size-4 mr-1" />
          Routes
        </NuxtLink>
      </Button>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">Loading...</div>

    <div v-else-if="!routeData" class="text-center py-12 text-muted-foreground">Route not found.</div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-lg font-bold font-mono break-all">{{ routeData.route?.path || routeData.route?.url }}</h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline" class="text-xs">{{ routeData.route?.device }}</Badge>
            <a :href="routeData.route?.url" target="_blank" class="hover:underline flex items-center gap-1">
              {{ routeData.route?.url }}
              <Icon name="lucide:external-link" class="size-3" />
            </a>
          </div>
          <!-- Provenance info -->
          <div v-if="routeData.provenance" class="flex items-center gap-3 mt-1 text-xs text-muted-foreground/60">
            <span>LH {{ routeData.provenance.lighthouseVersion }}</span>
            <span v-if="routeData.provenance.timingTotal">{{ (routeData.provenance.timingTotal / 1000).toFixed(1) }}s audit</span>
            <span v-if="routeData.provenance.warnings?.length" class="text-orange-500">
              {{ routeData.provenance.warnings.length }} warning(s)
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" :disabled="rescanning" @click="rescanRoute">
          <Icon v-if="rescanning" name="lucide:loader-2" class="size-4 mr-1 animate-spin" />
          <Icon v-else name="lucide:refresh-cw" class="size-4 mr-1" />
          Rescan
        </Button>
      </div>

      <!-- Screenshot -->
      <Card v-if="routeData.screenshotUrl">
        <CardContent class="pt-4">
          <img :src="routeData.screenshotUrl" alt="Page screenshot" class="rounded-lg border max-h-64 object-contain mx-auto" />
        </CardContent>
      </Card>

      <!-- Category Scores (dynamic) -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card v-for="s in scores" :key="s.id" class="cursor-pointer transition-all hover:ring-2 hover:ring-primary/20" @click="selectedCategory = selectedCategory === s.id ? null : s.id">
          <CardContent class="pt-5 pb-4 flex items-center gap-4">
            <ScoreRing :score="s.score" size="md" />
            <div>
              <div class="text-sm font-medium">{{ s.label }}</div>
              <div class="text-2xl font-bold tabular-nums" :style="{ color: scoreToRingColor(s.score) }">
                {{ scoreToLabel(s.score) }}
              </div>
              <div class="text-[10px] text-muted-foreground">
                {{ s.passingCount }}/{{ s.auditCount }} passing
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Core Web Vitals -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Core Web Vitals & Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            <div v-for="m in metrics" :key="m.label" class="rounded-lg border p-4 text-center">
              <div class="text-xs text-muted-foreground mb-1">{{ m.label }}</div>
              <div class="text-xl font-bold tabular-nums" :class="metricColor(m.label, m.value)">
                {{ formatMetric(m.value, m.unit) }}
              </div>
              <div class="text-[10px] text-muted-foreground/60 mt-1">{{ m.description }}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Failing Audits -->
      <Card v-if="failingAudits.length > 0">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ selectedCategory ? `${selectedCategory} Audits` : 'Failing Audits' }}
              <Badge variant="secondary" class="ml-2">{{ filteredAudits.length }}</Badge>
            </CardTitle>
            <Button v-if="selectedCategory" variant="ghost" size="sm" @click="selectedCategory = null">
              Show all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" class="w-full">
            <AccordionItem v-for="audit in filteredAudits" :key="audit.id" :value="audit.id">
              <AccordionTrigger class="text-sm">
                <div class="flex items-center gap-2 text-left">
                  <Badge :variant="severityColor(audit.severity)" class="text-[10px] w-10 justify-center">
                    {{ audit.severity }}
                  </Badge>
                  <span>{{ audit.title || audit.id }}</span>
                  <span v-if="audit.displayValue" class="text-muted-foreground text-xs ml-auto mr-4">
                    {{ audit.displayValue }}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div class="space-y-3 pt-2">
                  <p v-if="audit.description" class="text-xs text-muted-foreground">{{ audit.description }}</p>
                  <!-- Metric savings -->
                  <div v-if="audit.metricSavings" class="flex gap-2 flex-wrap">
                    <Badge v-for="(val, key) in audit.metricSavings" :key="key" variant="outline" class="text-[10px]">
                      {{ key }}: {{ typeof val === 'number' ? `${Math.round(val)}ms` : val }}
                    </Badge>
                  </div>
                  <!-- Items -->
                  <div v-if="audit.items?.length" class="border rounded-lg overflow-hidden">
                    <div v-for="(item, idx) in audit.items.slice(0, 10)" :key="idx" class="border-b last:border-b-0 p-2 text-xs">
                      <div v-if="item.url" class="font-mono break-all text-muted-foreground">{{ item.url }}</div>
                      <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-muted p-1 rounded mt-1">{{ item.node.snippet }}</div>
                      <div v-if="item.reason" class="text-muted-foreground mt-1">{{ item.reason }}</div>
                      <div class="flex gap-2 mt-1">
                        <span v-if="item.wastedBytes" class="text-orange-500">{{ (item.wastedBytes / 1024).toFixed(1) }}KB wasted</span>
                        <span v-if="item.wastedMs" class="text-orange-500">{{ Math.round(item.wastedMs) }}ms wasted</span>
                        <span v-if="item.blockingTime" class="text-red-500">{{ Math.round(item.blockingTime) }}ms blocking</span>
                      </div>
                    </div>
                    <div v-if="audit.items.length > 10" class="p-2 text-xs text-muted-foreground text-center">
                      +{{ audit.items.length - 10 }} more items
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <!-- Stack Packs (framework recommendations) -->
      <Card v-if="routeData.stackPacks?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Framework Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-for="pack in routeData.stackPacks" :key="pack.id" class="mb-4 last:mb-0">
            <div class="flex items-center gap-2 mb-2">
              <img v-if="pack.iconDataURL" :src="pack.iconDataURL" :alt="pack.title" class="size-5" />
              <span class="text-sm font-medium">{{ pack.title }}</span>
            </div>
            <div v-for="(desc, auditId) in pack.descriptions" :key="auditId" class="text-xs text-muted-foreground ml-7 mb-1">
              <span class="font-mono text-primary/80">{{ auditId }}</span>: {{ desc }}
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Entities (third parties) -->
      <Card v-if="routeData.entities?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Third-Party Entities</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            <Badge v-for="entity in routeData.entities" :key="entity.name" :variant="entity.isFirstParty ? 'default' : 'outline'" class="text-xs">
              {{ entity.name }}
              <span v-if="entity.isFirstParty" class="ml-1 text-[10px] opacity-60">1P</span>
            </Badge>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
