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
function severityVariant(severity: string) {
  if (severity === 'fail') return 'error' as const
  if (severity === 'warn') return 'warning' as const
  return 'neutral' as const
}

function severityIcon(severity: string) {
  if (severity === 'pass') return 'lucide:check-circle'
  if (severity === 'warn') return 'lucide:alert-triangle'
  return 'lucide:x-circle'
}

function severityColor(severity: string) {
  if (severity === 'pass') return 'text-success'
  if (severity === 'warn') return 'text-warning'
  return 'text-destructive'
}

const findingItems = computed(() =>
  ((report.value as any)?.findings ?? []).map((f: any) => ({ ...f, value: f.auditId })),
)
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
      <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
        <div class="numerals-display text-2xl">{{ report.routesAnalysed ?? 0 }}</div>
        <div class="text-xs text-muted-foreground">Routes Analysed</div>
      </div>
      <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
        <div class="numerals-display text-2xl" :class="report.avgScore != null && report.avgScore >= 0.9 ? 'text-success' : report.avgScore >= 0.5 ? 'text-warning' : 'text-destructive'">{{ report.avgScore != null ? Math.round(report.avgScore * 100) : '—' }}</div>
        <div class="text-xs text-muted-foreground">Avg Score</div>
      </div>
      <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
        <Icon :name="report.hasLlmsTxt ? 'lucide:check-circle' : 'lucide:x-circle'" :class="report.hasLlmsTxt ? 'text-success' : 'text-destructive'" class="size-6 mx-auto mb-1" />
        <div class="text-xs text-muted-foreground">llms.txt</div>
      </div>
      <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
        <div class="numerals-display text-2xl">{{ report.webmcp?.routesWithTools ?? 0 }}</div>
        <div class="text-xs text-muted-foreground">Routes with Tools</div>
      </div>
    </div>

    <UiCard v-if="report.webmcp" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">WebMCP</h3>
      </template>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-3 border rounded-lg text-center">
            <Icon
              :name="report.webmcp.hasRegisteredTools ? 'lucide:check-circle' : 'lucide:x-circle'"
              :class="report.webmcp.hasRegisteredTools ? 'text-success' : 'text-muted-foreground'"
              class="size-5 mx-auto mb-1"
            />
            <div class="text-xs text-muted-foreground">
              Registered Tools
            </div>
          </div>
          <div class="p-3 border rounded-lg text-center">
            <div class="text-lg font-bold tabular-nums">
              {{ report.webmcp.formCoverage != null ? `${Math.round(report.webmcp.formCoverage * 100)}%` : '—' }}
            </div>
            <div class="text-xs text-muted-foreground">
              Form Coverage
            </div>
          </div>
          <div class="p-3 border rounded-lg text-center">
            <Icon
              :name="report.webmcp.schemaValid ? 'lucide:check-circle' : report.webmcp.schemaValid === false ? 'lucide:x-circle' : 'lucide:minus-circle'"
              :class="report.webmcp.schemaValid ? 'text-success' : report.webmcp.schemaValid === false ? 'text-destructive' : 'text-muted-foreground'"
              class="size-5 mx-auto mb-1"
            />
            <div class="text-xs text-muted-foreground">
              Schema Valid
            </div>
          </div>
          <div class="p-3 border rounded-lg text-center">
            <div class="text-lg font-bold tabular-nums">
              {{ report.agentA11yTree?.passingCount ?? 0 }}/{{ report.agentA11yTree?.routeCount ?? 0 }}
            </div>
            <div class="text-xs text-muted-foreground">
              A11y Tree Pass
            </div>
          </div>
        </div>
    </UiCard>

    <UiCard v-if="report.findings?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed flex items-center gap-2">
          Audit Findings
          <UBadge color="neutral" variant="soft" class="text-xs">
            {{ report.findings.length }}
          </UBadge>
        </h3>
      </template>
        <UAccordion :items="findingItems" type="multiple" class="w-full">
          <template #default="{ item: finding }">
            <div class="flex items-center gap-3 text-left flex-1 min-w-0 text-sm">
              <Icon :name="severityIcon(finding.severity)" :class="severityColor(finding.severity)" class="size-4 shrink-0" />
              <span class="truncate">{{ finding.title || finding.auditId }}</span>
              <UBadge :color="severityVariant(finding.severity)" variant="soft" class="text-[10px] shrink-0">
                {{ finding.passingRouteCount }}/{{ finding.routeCount }} pass
              </UBadge>
            </div>
          </template>
          <template #content="{ item: finding }">
            <div v-if="finding.failingRoutes?.length" class="text-xs text-muted-foreground pb-2">
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
            <div v-else class="text-xs text-success pb-2">
              All routes passing.
            </div>
          </template>
        </UAccordion>
    </UiCard>

    <div v-if="!report.findings?.length" class="text-center py-12 text-muted-foreground">
      No agentic browsing issues found.
    </div>
  </CategoryPageShell>
</template>
