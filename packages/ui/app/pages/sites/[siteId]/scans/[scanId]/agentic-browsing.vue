<script setup lang="ts">
definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()

const { data: agenticPack, status } = useAsyncData(
  `agentic-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'agentic-browsing' }).catch(() => null),
)

const report = computed(() => (agenticPack.value as any)?.report ?? null)

// Agentic Browsing has its own pass/fail-based severity (vs the
// critical/serious/moderate scheme PackFindings handles) so we render
// the findings inline rather than via the shared component.
function severityBadge(severity: string) {
  if (severity === 'fail') return { color: 'error' as const, variant: 'subtle' as const }
  if (severity === 'warn') return { color: 'neutral' as const, variant: 'subtle' as const }
  return { color: 'neutral' as const, variant: 'outline' as const }
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
  <CategoryPageShell
    title="Agentic Browsing"
    pack="agentic-browsing"
    :status="status"
    :report="report"
    empty-message="No agentic browsing data available. Run a scan first."
    loading-message="Loading agentic browsing data..."
  >
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold tabular-nums">
            {{ report.routesAnalysed ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Routes Analysed
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold tabular-nums" :class="report.avgScore != null && report.avgScore >= 0.9 ? 'text-green-500' : report.avgScore >= 0.5 ? 'text-orange-500' : 'text-red-500'">
            {{ report.avgScore != null ? Math.round(report.avgScore * 100) : '—' }}
          </div>
          <div class="text-xs text-muted">
            Avg Score
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <Icon
            :name="report.hasLlmsTxt ? 'lucide:check-circle' : 'lucide:x-circle'"
            :class="report.hasLlmsTxt ? 'text-green-500' : 'text-red-500'"
            class="size-6 mx-auto mb-1"
          />
          <div class="text-xs text-muted">
            llms.txt
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold tabular-nums">
            {{ report.webmcp?.routesWithTools ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Routes with Tools
          </div>
        </div>
      </UCard>
    </div>

    <UCard v-if="report.webmcp">
      <template #header>
        <h3 class="text-sm font-medium text-muted">
          WebMCP
        </h3>
      </template>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-3 border border-default rounded-lg text-center">
          <Icon
            :name="report.webmcp.hasRegisteredTools ? 'lucide:check-circle' : 'lucide:x-circle'"
            :class="report.webmcp.hasRegisteredTools ? 'text-green-500' : 'text-muted'"
            class="size-5 mx-auto mb-1"
          />
          <div class="text-xs text-muted">
            Registered Tools
          </div>
        </div>
        <div class="p-3 border border-default rounded-lg text-center">
          <div class="text-lg font-bold tabular-nums">
            {{ report.webmcp.formCoverage != null ? `${Math.round(report.webmcp.formCoverage * 100)}%` : '—' }}
          </div>
          <div class="text-xs text-muted">
            Form Coverage
          </div>
        </div>
        <div class="p-3 border border-default rounded-lg text-center">
          <Icon
            :name="report.webmcp.schemaValid ? 'lucide:check-circle' : report.webmcp.schemaValid === false ? 'lucide:x-circle' : 'lucide:minus-circle'"
            :class="report.webmcp.schemaValid ? 'text-green-500' : report.webmcp.schemaValid === false ? 'text-red-500' : 'text-muted'"
            class="size-5 mx-auto mb-1"
          />
          <div class="text-xs text-muted">
            Schema Valid
          </div>
        </div>
        <div class="p-3 border border-default rounded-lg text-center">
          <div class="text-lg font-bold tabular-nums">
            {{ report.agentA11yTree?.passingCount ?? 0 }}/{{ report.agentA11yTree?.routeCount ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            A11y Tree Pass
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="report.findings?.length">
      <template #header>
        <h3 class="text-sm font-medium text-muted flex items-center gap-2">
          Audit Findings
          <UBadge color="neutral" variant="subtle" class="text-xs">
            {{ report.findings.length }}
          </UBadge>
        </h3>
      </template>
      <UAccordion
        type="multiple"
        :items="report.findings"
        value-key="auditId"
        :ui="{ trigger: 'text-sm', label: 'flex-1 min-w-0' }"
      >
        <template #default="{ item: finding }">
          <div class="flex items-center gap-3 text-left flex-1 min-w-0">
            <Icon :name="severityIcon(finding.severity)" :class="severityColor(finding.severity)" class="size-4 shrink-0" />
            <span class="truncate">{{ finding.title || finding.auditId }}</span>
            <UBadge v-bind="severityBadge(finding.severity)" class="text-[10px] shrink-0">
              {{ finding.passingRouteCount }}/{{ finding.routeCount }} pass
            </UBadge>
          </div>
        </template>
        <template #content="{ item: finding }">
          <div v-if="finding.failingRoutes?.length" class="text-xs text-muted">
            Failing routes:
            <ul class="mt-1 space-y-0.5 font-mono">
              <li v-for="r in finding.failingRoutes.slice(0, 10)" :key="r">
                {{ r }}
              </li>
              <li v-if="finding.failingRoutes.length > 10">
                +{{ finding.failingRoutes.length - 10 }} more
              </li>
            </ul>
          </div>
          <div v-else class="text-xs text-green-600">
            All routes passing.
          </div>
        </template>
      </UAccordion>
    </UCard>

    <div v-if="!report.findings?.length" class="text-center py-12 text-muted">
      No agentic browsing issues found.
    </div>
  </CategoryPageShell>
</template>
