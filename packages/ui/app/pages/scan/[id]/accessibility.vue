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

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string

const { data: a11yPack, status } = useAsyncData(
  `a11y-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'a11y-quick-wins' }).catch(() => null),
)

const a11yReport = computed(() => (a11yPack.value as any)?.report ?? null)

function severityVariant(severity: string) {
  if (severity === 'critical' || severity === 'serious' || severity === 'fail') return 'destructive' as const
  if (severity === 'moderate' || severity === 'warn') return 'secondary' as const
  return 'outline' as const
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
      <h1 class="text-xl font-bold tracking-tight">Accessibility</h1>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading accessibility data...
    </div>

    <div v-else-if="!a11yReport" class="text-center py-12 text-muted-foreground">
      No accessibility data available. Run a scan first.
    </div>

    <template v-else>
      <!-- Summary stats -->
      <div v-if="a11yReport.summary" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold text-red-500 tabular-nums">{{ a11yReport.summary?.totalFindings ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Total Issues</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums">{{ a11yReport.summary?.routesAffected ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Routes Affected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums">{{ a11yReport.summary?.uniqueRules ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Unique Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold text-green-500 tabular-nums">{{ a11yReport.routesAnalysed ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Routes Analysed</div>
          </CardContent>
        </Card>
      </div>

      <!-- Findings -->
      <Card v-if="a11yReport.findings?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Accessibility Issues
            <Badge variant="secondary" class="text-xs">{{ a11yReport.findings.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" class="w-full">
            <AccordionItem v-for="finding in a11yReport.findings" :key="finding.auditId" :value="finding.auditId">
              <AccordionTrigger class="text-sm">
                <div class="flex items-center gap-3 text-left flex-1 min-w-0">
                  <Badge :variant="severityVariant(finding.severity)" class="text-[10px] shrink-0">
                    {{ finding.severity }}
                  </Badge>
                  <span class="truncate">{{ finding.title || finding.auditId }}</span>
                  <span class="text-xs text-muted-foreground shrink-0">{{ finding.routeCount }} routes</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div class="text-sm space-y-3">
                  <p v-if="finding.description" class="text-muted-foreground">{{ finding.description }}</p>
                  <p v-if="finding.fixHint" class="text-xs bg-muted p-2 rounded">{{ finding.fixHint }}</p>
                  <div v-if="finding.elements?.length" class="space-y-2">
                    <div v-for="(el, i) in finding.elements.slice(0, 10)" :key="i" class="rounded border p-2">
                      <code class="text-xs bg-muted px-1.5 py-0.5 rounded">{{ el.selector || el.snippet }}</code>
                      <div v-if="el.nodeLabel" class="text-xs text-muted-foreground mt-1">{{ el.nodeLabel }}</div>
                    </div>
                    <p v-if="finding.elements.length > 10" class="text-xs text-muted-foreground text-center">
                      +{{ finding.elements.length - 10 }} more elements
                    </p>
                  </div>
                  <div v-if="finding.routes?.length" class="text-xs text-muted-foreground">
                    Affected routes:
                    <ul class="mt-1 space-y-0.5 font-mono">
                      <li v-for="r in finding.routes.slice(0, 5)" :key="r">{{ r }}</li>
                      <li v-if="finding.routes.length > 5">+{{ finding.routes.length - 5 }} more</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <div v-if="!a11yReport.findings?.length" class="text-center py-12 text-muted-foreground">
        No accessibility issues found.
      </div>
    </template>
  </div>
</template>
