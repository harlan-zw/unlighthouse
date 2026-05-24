<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'vue-sonner'

const route = useRoute()
const scanId = route.params.id as string
const routePath = decodeURIComponent(route.params.path as string)
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const api = useApi()
const { scoreToColor, scoreToLabel, scoreToRingColor } = useScoreColor()

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
    const res = await fetch(`${baseUrl}/dashboard/route/${scanId}/${encodeURIComponent(routePath)}`)
    if (!res.ok) return null
    return await res.json()
  },
)

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null) return '—'
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

const scores = computed(() => {
  if (!routeData.value) return []
  return [
    { label: 'Performance', score: routeData.value.scorePerformance, icon: 'lucide:gauge' },
    { label: 'Accessibility', score: routeData.value.scoreAccessibility, icon: 'lucide:accessibility' },
    { label: 'SEO', score: routeData.value.scoreSeo, icon: 'lucide:search' },
    { label: 'Best Practices', score: routeData.value.scoreBestPractices, icon: 'lucide:shield-check' },
  ]
})

const metrics = computed(() => {
  if (!routeData.value) return []
  return [
    { label: 'LCP', value: routeData.value.lcp, unit: 'ms', description: 'Largest Contentful Paint' },
    { label: 'CLS', value: routeData.value.cls, unit: '', description: 'Cumulative Layout Shift' },
    { label: 'TBT', value: routeData.value.tbt, unit: 'ms', description: 'Total Blocking Time' },
    { label: 'FCP', value: routeData.value.fcp, unit: 'ms', description: 'First Contentful Paint' },
    { label: 'SI', value: routeData.value.si, unit: 'ms', description: 'Speed Index' },
    { label: 'TTFB', value: routeData.value.ttfb, unit: 'ms', description: 'Time to First Byte' },
  ]
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
  }
  const [good, poor] = thresholds[label] || [Infinity, Infinity]
  if (value <= good) return 'text-green-500'
  if (value <= poor) return 'text-orange-500'
  return 'text-red-500'
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
          <h1 class="text-lg font-bold font-mono break-all">{{ routeData.path || routeData.url }}</h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline" class="text-xs">{{ routeData.device }}</Badge>
            <a :href="routeData.url" target="_blank" class="hover:underline flex items-center gap-1">
              {{ routeData.url }}
              <Icon name="lucide:external-link" class="size-3" />
            </a>
          </div>
        </div>
        <Button variant="outline" size="sm" :disabled="rescanning" @click="rescanRoute">
          <Icon v-if="rescanning" name="lucide:loader-2" class="size-4 mr-1 animate-spin" />
          <Icon v-else name="lucide:refresh-cw" class="size-4 mr-1" />
          Rescan
        </Button>
      </div>

      <!-- Category Scores -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card v-for="s in scores" :key="s.label">
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
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
              <div v-if="routeData.seoMeta.titleLength != null" class="text-xs text-muted-foreground mt-0.5">
                {{ routeData.seoMeta.titleLength }} characters
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">Meta Description</div>
              <div class="text-sm">{{ routeData.seoMeta.metaDescription || '(missing)' }}</div>
              <div v-if="routeData.seoMeta.metaDescriptionLength != null" class="text-xs text-muted-foreground mt-0.5">
                {{ routeData.seoMeta.metaDescriptionLength }} characters
              </div>
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

          <Separator />

          <!-- OG Tags -->
          <div>
            <div class="text-xs text-muted-foreground mb-2">Open Graph</div>
            <div v-if="routeData.seoMeta.ogTitle || routeData.seoMeta.ogDescription || routeData.seoMeta.ogImage" class="grid gap-2 sm:grid-cols-2">
              <div v-if="routeData.seoMeta.ogTitle">
                <div class="text-[10px] text-muted-foreground/60">og:title</div>
                <div class="text-sm">{{ routeData.seoMeta.ogTitle }}</div>
              </div>
              <div v-if="routeData.seoMeta.ogDescription">
                <div class="text-[10px] text-muted-foreground/60">og:description</div>
                <div class="text-sm">{{ routeData.seoMeta.ogDescription }}</div>
              </div>
              <div v-if="routeData.seoMeta.ogImage" class="sm:col-span-2">
                <div class="text-[10px] text-muted-foreground/60">og:image</div>
                <div class="text-sm font-mono break-all">{{ routeData.seoMeta.ogImage }}</div>
              </div>
            </div>
            <div v-else class="text-sm text-muted-foreground">No OG tags</div>
          </div>

          <!-- Structured Data -->
          <div v-if="routeData.seoMeta.structuredDataTypes?.length">
            <div class="text-xs text-muted-foreground mb-2">Structured Data</div>
            <div class="flex flex-wrap gap-1.5">
              <Badge v-for="t in routeData.seoMeta.structuredDataTypes" :key="t" variant="outline" class="text-xs">
                {{ t }}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
