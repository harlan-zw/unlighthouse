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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string

const { data: seoPack, status } = useAsyncData(
  `seo-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'seo-basics' }).catch(() => null),
)

const report = computed(() => (seoPack.value as any)?.report ?? null)

function severityVariant(severity: string) {
  if (severity === 'critical' || severity === 'serious') return 'destructive' as const
  if (severity === 'moderate') return 'secondary' as const
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
      <h1 class="text-xl font-bold tracking-tight">SEO</h1>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading SEO data...
    </div>

    <div v-else-if="!report" class="text-center py-12 text-muted-foreground">
      No SEO data available. Run a scan first.
    </div>

    <template v-else>
      <!-- Summary stats -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums" :class="report.indexabilityPercent === 100 ? 'text-green-500' : report.indexabilityPercent >= 80 ? 'text-orange-500' : 'text-red-500'">
              {{ report.indexabilityPercent ?? 0 }}%
            </div>
            <div class="text-xs text-muted-foreground">Indexability</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold text-green-500 tabular-nums">{{ report.indexableRoutes ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Indexable Routes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums" :class="report.unindexableRoutes > 0 ? 'text-red-500' : 'text-green-500'">{{ report.unindexableRoutes ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Unindexable Routes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-2xl font-bold tabular-nums">{{ report.routesAnalysed ?? 0 }}</div>
            <div class="text-xs text-muted-foreground">Routes Analysed</div>
          </CardContent>
        </Card>
      </div>

      <!-- Severity counts -->
      <div v-if="report.severityCounts" class="flex gap-2 flex-wrap">
        <Badge v-if="report.severityCounts.critical > 0" variant="destructive" class="text-xs">{{ report.severityCounts.critical }} critical</Badge>
        <Badge v-if="report.severityCounts.serious > 0" variant="destructive" class="text-xs">{{ report.severityCounts.serious }} serious</Badge>
        <Badge v-if="report.severityCounts.moderate > 0" variant="secondary" class="text-xs">{{ report.severityCounts.moderate }} moderate</Badge>
        <Badge v-if="report.severityCounts.minor > 0" variant="outline" class="text-xs">{{ report.severityCounts.minor }} minor</Badge>
        <Badge v-if="!report.severityCounts.critical && !report.severityCounts.serious && !report.severityCounts.moderate && !report.severityCounts.minor" variant="outline" class="text-xs text-green-600">No issues found</Badge>
      </div>

      <!-- Findings -->
      <Card v-if="report.findings?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            SEO Issues
            <Badge variant="secondary" class="text-xs">{{ report.findings.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" class="w-full">
            <AccordionItem v-for="finding in report.findings" :key="finding.auditId" :value="finding.auditId">
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
                <div class="text-sm space-y-2">
                  <p v-if="finding.description" class="text-muted-foreground text-xs">{{ finding.description }}</p>
                  <div v-if="finding.routes?.length" class="text-xs text-muted-foreground">
                    Affected routes:
                    <ul class="mt-1 space-y-0.5 font-mono">
                      <li v-for="r in finding.routes.slice(0, 10)" :key="r">{{ r }}</li>
                      <li v-if="finding.routes.length > 10">+{{ finding.routes.length - 10 }} more</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <!-- Route Checks -->
      <Card v-if="report.routeChecks?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Route Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead class="w-20 text-right">Passes</TableHead>
                <TableHead class="w-20 text-right">Fails</TableHead>
                <TableHead class="w-20">Indexable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="rc in report.routeChecks" :key="rc.url">
                <TableCell class="font-mono text-xs truncate max-w-sm">{{ rc.url }}</TableCell>
                <TableCell class="text-right tabular-nums text-green-500">{{ rc.passes }}</TableCell>
                <TableCell class="text-right tabular-nums" :class="rc.fails > 0 ? 'text-red-500' : ''">{{ rc.fails }}</TableCell>
                <TableCell>
                  <Icon
                    :name="rc.indexable ? 'lucide:check-circle' : 'lucide:x-circle'"
                    :class="rc.indexable ? 'text-green-500' : 'text-red-500'"
                    class="size-4"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="!report.findings?.length && !report.routeChecks?.length" class="text-center py-12 text-muted-foreground">
        No SEO issues found.
      </div>
    </template>
  </div>
</template>
