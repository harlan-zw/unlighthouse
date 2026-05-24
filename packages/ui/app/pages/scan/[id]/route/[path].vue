<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { toast } from 'vue-sonner'

const route = useRoute()
const scanId = route.params.id as string
const routePath = decodeURIComponent(route.params.path as string)
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const api = useApi()
const { scoreToLabel, scoreToRingColor } = useScoreColor()

const rescanning = ref(false)

async function rescanRoute() {
  rescanning.value = true
  try {
    await api['route.rescan']({ scanId, url: routeData.value?.url || routePath })
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
      const res = await fetch(`${baseUrl}/dashboard/route/${scanId}/${encodeURIComponent(routePath)}`)
      if (!res.ok) return null
      return await res.json()
    }
    catch {
      return null
    }
  },
)

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null || value === undefined) return '—'
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

const categoryLabels: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
  'agentic-browsing': 'Agentic Browsing',
}

const scores = computed(() => {
  if (!routeData.value) return []
  const d = routeData.value
  const cats = [
    { id: 'performance', label: 'Performance', score: d.scorePerformance ?? d.metrics?.scorePerformance },
    { id: 'accessibility', label: 'Accessibility', score: d.scoreAccessibility ?? d.metrics?.scoreAccessibility },
    { id: 'seo', label: 'SEO', score: d.scoreSeo ?? d.metrics?.scoreSeo },
    { id: 'best-practices', label: 'Best Practices', score: d.scoreBestPractices ?? d.metrics?.scoreBestPractices },
  ]
  const ab = d.scoreAgenticBrowsing ?? d.metrics?.scoreAgenticBrowsing
  if (ab != null)
    cats.push({ id: 'agentic-browsing', label: 'Agentic Browsing', score: ab })
  return cats.filter(c => c.score != null)
})

const metrics = computed(() => {
  if (!routeData.value) return []
  const d = routeData.value
  return [
    { label: 'LCP', value: d.lcp ?? d.metrics?.lcp, unit: 'ms', description: 'Largest Contentful Paint' },
    { label: 'CLS', value: d.cls ?? d.metrics?.cls, unit: '', description: 'Cumulative Layout Shift' },
    { label: 'TBT', value: d.tbt ?? d.metrics?.tbt, unit: 'ms', description: 'Total Blocking Time' },
    { label: 'FCP', value: d.fcp ?? d.metrics?.fcp, unit: 'ms', description: 'First Contentful Paint' },
    { label: 'SI', value: d.si ?? d.metrics?.si, unit: 'ms', description: 'Speed Index' },
    { label: 'TTFB', value: d.ttfb ?? d.metrics?.ttfb, unit: 'ms', description: 'Time to First Byte' },
    { label: 'INP', value: d.inp ?? d.metrics?.inp, unit: 'ms', description: 'Interaction to Next Paint' },
  ]
})

interface AuditEntry {
  id: string
  title: string | null
  description: string | null
  severity: 'pass' | 'warn' | 'fail'
  score: number | null
  displayValue: string | null
  metricSavings: Record<string, number> | null
  items: any[] | null
  scoreDisplayMode: string
}

const categoryAudits = computed(() => {
  if (!routeData.value?.categories || !routeData.value?.audits) return []
  const cats = routeData.value.categories as Record<string, { score: number | null, auditRefs: Array<{ id: string, weight: number }> }>
  const audits = routeData.value.audits as Record<string, AuditEntry>

  return Object.entries(cats).map(([catId, cat]) => {
    const catAudits = cat.auditRefs
      .map(r => audits[r.id])
      .filter((a): a is AuditEntry => !!a)

    const failing = catAudits
      .filter(a => a.severity === 'fail' || a.severity === 'warn')
      .sort((a, b) => {
        if (a.severity === 'fail' && b.severity !== 'fail') return -1
        if (a.severity !== 'fail' && b.severity === 'fail') return 1
        return (a.score ?? 0) - (b.score ?? 0)
      })

    const passing = catAudits
      .filter(a => a.severity === 'pass' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual')

    const notApplicable = catAudits
      .filter(a => a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual')

    return {
      id: catId,
      label: categoryLabels[catId] || catId,
      icon: categoryIcons[catId] || 'lucide:folder',
      score: cat.score,
      failing,
      passing,
      notApplicable,
    }
  })
})

function metricColor(label: string, value: number | null | undefined): string {
  if (value == null) return 'text-muted-foreground'
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000], CLS: [0.1, 0.25], TBT: [200, 600],
    FCP: [1800, 3000], SI: [3400, 5800], TTFB: [800, 1800], INP: [200, 500],
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

function renderMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="underline text-primary hover:text-primary/80">$1</a>')
}

function hasVisibleContent(item: any): boolean {
  return !!(item.url || item.node?.snippet || item.reason || item.wastedBytes || item.wastedMs || item.snippet)
}

function hasNonZeroSavings(savings: Record<string, any>): boolean {
  return Object.values(savings).some(v => typeof v === 'number' ? v > 0 : !!v)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
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
          <h1 class="text-lg font-bold font-mono break-all">{{ routeData.path || routeData.route?.path }}</h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline" class="text-xs">{{ routeData.device || routeData.route?.device }}</Badge>
            <a :href="routeData.url || routeData.route?.url" target="_blank" class="hover:underline flex items-center gap-1">
              {{ routeData.url || routeData.route?.url }}
              <Icon name="lucide:external-link" class="size-3" />
            </a>
          </div>
          <div v-if="routeData.provenance || routeData.lighthouseVersion" class="flex items-center gap-3 mt-1 text-xs text-muted-foreground/60">
            <span>LH {{ routeData.provenance?.lighthouseVersion || routeData.lighthouseVersion }}</span>
            <span v-if="routeData.provenance?.timingTotal">{{ (routeData.provenance.timingTotal / 1000).toFixed(1) }}s audit</span>
          </div>
        </div>
        <Button variant="outline" size="sm" :disabled="rescanning" @click="rescanRoute">
          <Icon v-if="rescanning" name="lucide:loader-2" class="size-4 mr-1 animate-spin" />
          <Icon v-else name="lucide:refresh-cw" class="size-4 mr-1" />
          Rescan
        </Button>
      </div>

      <!-- Runtime Error -->
      <div v-if="routeData.provenance?.runtimeError" class="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm font-medium text-red-500">
          <Icon name="lucide:alert-triangle" class="size-4" />
          Runtime Error: {{ routeData.provenance.runtimeError.code }}
        </div>
        <p class="text-xs text-muted-foreground mt-1">{{ routeData.provenance.runtimeError.message }}</p>
      </div>

      <!-- Warnings -->
      <div v-if="routeData.provenance?.warnings?.length" class="border border-orange-500/30 bg-orange-500/5 rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm font-medium text-orange-500 mb-2">
          <Icon name="lucide:alert-circle" class="size-4" />
          Warnings ({{ routeData.provenance.warnings.length }})
        </div>
        <ul class="text-xs text-muted-foreground space-y-1">
          <li v-for="(w, i) in routeData.provenance.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <!-- Category Scores -->
      <div class="grid grid-cols-2" :class="scores.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'" style="gap: 1rem;">
        <Card v-for="s in scores" :key="s.id">
          <CardContent class="pt-5 pb-4 flex items-center gap-4">
            <ScoreRing :score="s.score" size="md" />
            <div>
              <div class="text-sm font-medium">{{ s.label }}</div>
              <div class="text-2xl font-bold tabular-nums" :style="{ color: scoreToRingColor(s.score) }">
                {{ scoreToLabel(s.score) }}
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

      <!-- Category Sections -->
      <template v-for="cat in categoryAudits" :key="cat.id">
        <Card>
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2 text-base">
                <Icon :name="cat.icon" class="size-4" />
                {{ cat.label }}
              </CardTitle>
              <div class="flex items-center gap-2">
                <Badge v-if="cat.failing.length" variant="destructive" class="text-xs">
                  {{ cat.failing.length }} failing
                </Badge>
                <Badge v-if="cat.passing.length" variant="outline" class="text-xs text-green-600">
                  {{ cat.passing.length }} passed
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Failing audits -->
            <Accordion v-if="cat.failing.length" type="multiple" class="w-full">
              <AccordionItem v-for="audit in cat.failing" :key="audit.id" :value="audit.id">
                <AccordionTrigger class="text-sm">
                  <div class="flex items-center gap-2 text-left">
                    <Badge :variant="severityColor(audit.severity)" class="text-[10px] w-10 justify-center shrink-0">
                      {{ audit.severity }}
                    </Badge>
                    <span>{{ audit.title || audit.id }}</span>
                    <span v-if="audit.displayValue" class="text-muted-foreground text-xs ml-auto mr-4 shrink-0">
                      {{ audit.displayValue }}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div class="space-y-3 pt-2">
                    <p v-if="audit.description" class="text-xs text-muted-foreground" v-html="renderMarkdownLinks(audit.description)" />
                    <div v-if="audit.metricSavings && hasNonZeroSavings(audit.metricSavings)" class="flex gap-2 flex-wrap">
                      <template v-for="(val, key) in audit.metricSavings" :key="key">
                        <Badge v-if="typeof val === 'number' ? val > 0 : !!val" variant="outline" class="text-[10px]">
                          {{ key }}: {{ typeof val === 'number' ? `${Math.round(val)}ms` : val }}
                        </Badge>
                      </template>
                    </div>
                    <div v-if="audit.items?.filter(hasVisibleContent).length" class="border rounded-lg overflow-hidden">
                      <template v-for="(item, idx) in audit.items.slice(0, 20)" :key="idx">
                        <div v-if="hasVisibleContent(item)" class="border-b last:border-b-0 p-2 text-xs">
                          <div v-if="item.url" class="font-mono break-all text-muted-foreground">{{ item.url }}</div>
                          <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-muted p-1 rounded mt-1">{{ item.node.snippet }}</div>
                          <div v-if="item.snippet" class="font-mono text-[10px] bg-muted p-1 rounded mt-1">{{ item.snippet }}</div>
                          <div v-if="item.node?.nodeLabel" class="text-muted-foreground mt-1">{{ item.node.nodeLabel }}</div>
                          <div v-if="item.reason" class="text-muted-foreground mt-1">{{ item.reason }}</div>
                          <div class="flex gap-2 mt-1 flex-wrap">
                            <span v-if="item.wastedBytes" class="text-orange-500">{{ formatBytes(item.wastedBytes) }} wasted</span>
                            <span v-if="item.wastedMs" class="text-orange-500">{{ Math.round(item.wastedMs) }}ms wasted</span>
                            <span v-if="item.totalBytes" class="text-muted-foreground">{{ formatBytes(item.totalBytes) }} total</span>
                            <span v-if="item.transferSize" class="text-muted-foreground">{{ formatBytes(item.transferSize) }} transferred</span>
                            <span v-if="item.blockingTime" class="text-orange-500">{{ Math.round(item.blockingTime) }}ms blocking</span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Separator v-if="cat.failing.length && (cat.passing.length || cat.notApplicable.length)" />

            <!-- Passed audits (collapsible) -->
            <Collapsible v-if="cat.passing.length">
              <CollapsibleTrigger class="flex items-center gap-2 w-full text-sm py-1 group">
                <Icon name="lucide:chevron-right" class="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                <Icon name="lucide:check-circle" class="size-4 text-green-500" />
                <span class="text-green-600 font-medium">Passed Audits</span>
                <Badge variant="outline" class="text-[10px] text-green-600">{{ cat.passing.length }}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Accordion type="multiple" class="w-full mt-2">
                  <AccordionItem v-for="audit in cat.passing" :key="audit.id" :value="audit.id">
                    <AccordionTrigger class="text-sm py-2">
                      <div class="flex items-center gap-2 text-left">
                        <Icon name="lucide:check" class="size-3.5 text-green-500 shrink-0" />
                        <span class="text-muted-foreground">{{ audit.title || audit.id }}</span>
                        <span v-if="audit.displayValue" class="text-muted-foreground/60 text-xs ml-auto mr-4 shrink-0">
                          {{ audit.displayValue }}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div class="space-y-2 pt-1 pl-6">
                        <p v-if="audit.description" class="text-xs text-muted-foreground" v-html="renderMarkdownLinks(audit.description)" />
                        <div v-if="audit.items?.filter(hasVisibleContent).length" class="border rounded-lg overflow-hidden">
                          <template v-for="(item, idx) in audit.items.slice(0, 10)" :key="idx">
                            <div v-if="hasVisibleContent(item)" class="border-b last:border-b-0 p-2 text-xs">
                              <div v-if="item.url" class="font-mono break-all text-muted-foreground">{{ item.url }}</div>
                              <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-muted p-1 rounded mt-1">{{ item.node.snippet }}</div>
                              <div v-if="item.snippet" class="font-mono text-[10px] bg-muted p-1 rounded mt-1">{{ item.snippet }}</div>
                              <div class="flex gap-2 mt-1 flex-wrap">
                                <span v-if="item.totalBytes" class="text-muted-foreground">{{ formatBytes(item.totalBytes) }}</span>
                                <span v-if="item.transferSize" class="text-muted-foreground">{{ formatBytes(item.transferSize) }} transferred</span>
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CollapsibleContent>
            </Collapsible>

            <!-- Not Applicable (collapsible) -->
            <Collapsible v-if="cat.notApplicable.length">
              <CollapsibleTrigger class="flex items-center gap-2 w-full text-sm py-1 group">
                <Icon name="lucide:chevron-right" class="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                <Icon name="lucide:minus-circle" class="size-4 text-muted-foreground" />
                <span class="text-muted-foreground">Not Applicable</span>
                <Badge variant="outline" class="text-[10px]">{{ cat.notApplicable.length }}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div class="space-y-0.5 pt-2 pl-6">
                  <div v-for="audit in cat.notApplicable" :key="audit.id" class="flex items-center gap-2 py-1 text-sm text-muted-foreground/60">
                    <Icon name="lucide:minus" class="size-3 shrink-0" />
                    <span>{{ audit.title || audit.id }}</span>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </template>

      <!-- SEO Meta -->
      <Card v-if="routeData.seoMeta">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">SEO Meta</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="text-xs text-muted-foreground mb-1">Title</div>
              <div class="text-sm">{{ routeData.seoMeta.title || '(missing)' }}</div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">Meta Description</div>
              <div class="text-sm">{{ routeData.seoMeta.metaDescription || '(missing)' }}</div>
            </div>
          </div>
          <Separator />
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="text-xs text-muted-foreground mb-1">Canonical</div>
              <div class="text-sm font-mono break-all">{{ routeData.seoMeta.canonical || '(none)' }}</div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">Indexable</div>
              <div class="flex items-center gap-1.5">
                <Icon
                  :name="routeData.seoMeta.isIndexable ? 'lucide:check-circle' : 'lucide:x-circle'"
                  :class="routeData.seoMeta.isIndexable ? 'text-green-500' : 'text-red-500'"
                  class="size-4"
                />
                <span class="text-sm">{{ routeData.seoMeta.isIndexable ? 'Yes' : 'No' }}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Stack Packs -->
      <Card v-if="routeData.stackPacks?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Framework Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-for="pack in routeData.stackPacks" :key="pack.id" class="mb-4 last:mb-0">
            <div class="text-sm font-medium mb-1">{{ pack.title }}</div>
            <div v-for="(desc, auditId) in pack.descriptions" :key="auditId" class="text-xs text-muted-foreground ml-4 mb-1">
              <span class="font-mono text-primary/80">{{ auditId }}</span>: {{ desc }}
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Entities -->
      <Card v-if="routeData.entities?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Third-Party Entities</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            <Badge v-for="entity in routeData.entities" :key="entity.name" :variant="entity.isFirstParty ? 'default' : 'outline'" class="text-xs">
              {{ entity.name }}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
