<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { toast } from 'vue-sonner'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string

const { data: packList } = useAsyncData(
  'pack-list',
  () => api['pack.list']({}).catch(() => ({ packs: [] })),
)

const packResults = ref<Record<string, any>>({})
const runningPacks = ref<Set<string>>(new Set())

async function runPack(packName: string, refresh = false) {
  runningPacks.value.add(packName)
  try {
    const result = await api['pack.run']({ scanId, pack: packName, refresh })
    packResults.value[packName] = result
    toast.success(`${packName} analysis complete`, {
      description: result.cache === 'hit' ? 'Loaded from cache' : `Completed in ${((new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()) / 1000).toFixed(1)}s`,
    })
  }
  catch (err: any) {
    toast.error(`${packName} failed`, { description: err.message })
  }
  finally {
    runningPacks.value.delete(packName)
  }
}

const packIcons: Record<string, string> = {
  'overview': 'lucide:bar-chart-3',
  'cwv': 'lucide:gauge',
  'images': 'lucide:image',
  'js-bundle': 'lucide:file-code',
  'a11y-quick-wins': 'lucide:accessibility',
  'seo-basics': 'lucide:search',
}

function formatReport(report: any): Array<{ key: string, value: any }> {
  if (!report || typeof report !== 'object') return []
  return Object.entries(report).map(([key, value]) => ({ key, value }))
}

function renderValue(value: any): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
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
      <h1 class="text-xl font-bold tracking-tight">Analysis Packs</h1>
    </div>

    <p class="text-sm text-muted-foreground">
      Run cross-route analysis packs to get actionable insights. Results are cached per scan.
    </p>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card v-for="pack in packList?.packs" :key="pack.name" class="flex flex-col">
        <CardHeader class="pb-2">
          <div class="flex items-center gap-2">
            <Icon :name="packIcons[pack.name] || 'lucide:package'" class="size-5 text-muted-foreground" />
            <CardTitle class="text-sm font-medium">{{ pack.name }}</CardTitle>
            <Badge variant="outline" class="text-[10px] ml-auto">v{{ pack.version }}</Badge>
          </div>
        </CardHeader>
        <CardContent class="flex-1 flex flex-col">
          <p class="text-xs text-muted-foreground mb-4 flex-1">{{ pack.description }}</p>
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              :variant="packResults[pack.name] ? 'outline' : 'default'"
              :disabled="runningPacks.has(pack.name)"
              class="flex-1"
              @click="runPack(pack.name)"
            >
              <Icon v-if="runningPacks.has(pack.name)" name="lucide:loader-2" class="size-4 mr-1 animate-spin" />
              <Icon v-else-if="packResults[pack.name]" name="lucide:refresh-cw" class="size-4 mr-1" />
              <Icon v-else name="lucide:play" class="size-4 mr-1" />
              {{ packResults[pack.name] ? 'Refresh' : 'Run' }}
            </Button>
            <Badge v-if="packResults[pack.name]?.cache" variant="secondary" class="text-[10px]">
              {{ packResults[pack.name].cache }}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Results -->
    <template v-for="(result, packName) in packResults" :key="packName">
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium flex items-center gap-2">
            <Icon :name="packIcons[packName as string] || 'lucide:package'" class="size-4" />
            {{ packName }} Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="result.report && typeof result.report === 'object'" class="space-y-3">
            <Accordion type="multiple" class="w-full">
              <AccordionItem v-for="entry in formatReport(result.report)" :key="entry.key" :value="entry.key">
                <AccordionTrigger class="text-sm">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ entry.key }}</span>
                    <Badge v-if="Array.isArray(entry.value)" variant="secondary" class="text-[10px]">
                      {{ entry.value.length }}
                    </Badge>
                    <span v-else-if="typeof entry.value !== 'object'" class="text-muted-foreground text-xs">
                      {{ renderValue(entry.value) }}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div v-if="Array.isArray(entry.value) && entry.value.length">
                    <div
                      v-for="(item, i) in entry.value.slice(0, 20)"
                      :key="i"
                      class="border-b last:border-0 py-2 text-xs font-mono"
                    >
                      <pre class="whitespace-pre-wrap break-all text-muted-foreground">{{ JSON.stringify(item, null, 2) }}</pre>
                    </div>
                    <p v-if="entry.value.length > 20" class="text-xs text-muted-foreground pt-2">
                      ...and {{ entry.value.length - 20 }} more
                    </p>
                  </div>
                  <pre v-else class="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">{{ renderValue(entry.value) }}</pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <div v-else class="text-sm text-muted-foreground">
            <pre class="text-xs font-mono whitespace-pre-wrap">{{ JSON.stringify(result.report, null, 2) }}</pre>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
