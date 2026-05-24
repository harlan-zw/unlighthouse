<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string

const { data: agenticPack, status } = useAsyncData(
  `agentic-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'agentic-browsing' }).catch(() => null),
)

const report = computed(() => (agenticPack.value as any)?.report ?? null)

function severityVariant(severity: string) {
  if (severity === 'fail') return 'destructive' as const
  if (severity === 'warn') return 'secondary' as const
  return 'outline' as const
}

function severityIcon(severity: string) {
  if (severity === 'pass') return 'lucide:check-circle'
  if (severity === 'warn') return 'lucide:alert-triangle'
  return 'lucide:x-circle'
}

function severityColor(severity: string) {
  if (severity === 'pass') return 'text-green-500'
  if (severity === 'warn') return 'text-orange-500'
  return 'text-red-500'
}
</script>

<template>
  <div class="space-y-6">
    <ScanNav />
    <h1 class="text-xl font-bold tracking-tight">Agentic Browsing</h1>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading agentic browsing data...
    </div>

    <div v-else-if="!report" class="text-center py-12 text-muted-foreground">
      No agentic browsing data available. Run a scan first.
    </div>

    <template v-else>
      <!-- Summary -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums">{{ report.routesAnalysed ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Routes Analysed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums" :class="report.avgScore != null && report.avgScore >= 0.9 ? 'text-green-500' : report.avgScore >= 0.5 ? 'text-orange-500' : 'text-red-500'">
              {{ report.avgScore != null ? Math.round(report.avgScore * 100) : '—' }}
            </div>
            <div class="text-xs text-muted-foreground">Avg Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <Icon
              :name="report.hasLlmsTxt ? 'lucide:check-circle' : 'lucide:x-circle'"
              :class="report.hasLlmsTxt ? 'text-green-500' : 'text-red-500'"
              class="size-6 mx-auto mb-1"
            />
            <div class="text-xs text-muted-foreground">llms.txt</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums">{{ report.webmcp?.routesWithTools ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Routes with Tools</div>
          </CardContent>
        </Card>
      </div>

      <!-- WebMCP Details -->
      <Card v-if="report.webmcp">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">WebMCP</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="p-3 border rounded-lg text-center">
              <Icon
                :name="report.webmcp.hasRegisteredTools ? 'lucide:check-circle' : 'lucide:x-circle'"
                :class="report.webmcp.hasRegisteredTools ? 'text-green-500' : 'text-muted-foreground'"
                class="size-5 mx-auto mb-1"
              />
              <div class="text-xs text-muted-foreground">Registered Tools</div>
            </div>
            <div class="p-3 border rounded-lg text-center">
              <div class="text-lg font-bold tabular-nums">
                {{ report.webmcp.formCoverage != null ? `${Math.round(report.webmcp.formCoverage * 100)}%` : '—' }}
              </div>
              <div class="text-xs text-muted-foreground">Form Coverage</div>
            </div>
            <div class="p-3 border rounded-lg text-center">
              <Icon
                :name="report.webmcp.schemaValid ? 'lucide:check-circle' : report.webmcp.schemaValid === false ? 'lucide:x-circle' : 'lucide:minus-circle'"
                :class="report.webmcp.schemaValid ? 'text-green-500' : report.webmcp.schemaValid === false ? 'text-red-500' : 'text-muted-foreground'"
                class="size-5 mx-auto mb-1"
              />
              <div class="text-xs text-muted-foreground">Schema Valid</div>
            </div>
            <div class="p-3 border rounded-lg text-center">
              <div class="text-lg font-bold tabular-nums">
                {{ report.agentA11yTree?.passingCount ?? 0 }}/{{ report.agentA11yTree?.routeCount ?? 0 }}
              </div>
              <div class="text-xs text-muted-foreground">A11y Tree Pass</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Findings -->
      <Card v-if="report.findings?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Audit Findings
            <Badge variant="secondary" class="text-xs">{{ report.findings.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" class="w-full">
            <AccordionItem v-for="finding in report.findings" :key="finding.auditId" :value="finding.auditId">
              <AccordionTrigger class="text-sm">
                <div class="flex items-center gap-3 text-left flex-1 min-w-0">
                  <Icon :name="severityIcon(finding.severity)" :class="severityColor(finding.severity)" class="size-4 shrink-0" />
                  <span class="truncate">{{ finding.title || finding.auditId }}</span>
                  <Badge :variant="severityVariant(finding.severity)" class="text-[10px] shrink-0">
                    {{ finding.passingRouteCount }}/{{ finding.routeCount }} pass
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div v-if="finding.failingRoutes?.length" class="text-xs text-muted-foreground">
                  Failing routes:
                  <ul class="mt-1 space-y-0.5 font-mono">
                    <li v-for="r in finding.failingRoutes.slice(0, 10)" :key="r">{{ r }}</li>
                    <li v-if="finding.failingRoutes.length > 10">+{{ finding.failingRoutes.length - 10 }} more</li>
                  </ul>
                </div>
                <div v-else class="text-xs text-green-600">All routes passing.</div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <div v-if="!report.findings?.length" class="text-center py-12 text-muted-foreground">
        No agentic browsing issues found.
      </div>
    </template>
  </div>
</template>
