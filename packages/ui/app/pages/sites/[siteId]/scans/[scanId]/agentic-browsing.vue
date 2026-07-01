<script setup lang="ts">
import type { AgenticBrowsingReport } from '@unlighthouse/contracts/packs'
import CategoryPageShell from '~/features/scan/components/CategoryPageShell.vue'
import { getScanId } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

const scanId = getScanId()

const { data: agenticPack, status, error: agenticError, refresh: refreshAgentic } = useApiQuery('pack.run', () => ({ scanId, pack: 'agentic-browsing' }))

const report = computed(() => (agenticPack.value?.report ?? null) as AgenticBrowsingReport | null)

// Agentic Browsing has its own pass/fail-based severity (vs the
// critical/serious/moderate scheme PackFindings handles) so we render
// the findings inline rather than via the shared component.
function severityVariant(severity: string) {
  if (severity === 'fail')
    return 'error' as const
  if (severity === 'warn')
    return 'warning' as const
  return 'neutral' as const
}

function severityIcon(severity: string) {
  if (severity === 'pass')
    return 'success'
  if (severity === 'warn')
    return 'warning'
  return 'error'
}

function severityColor(severity: string) {
  if (severity === 'pass')
    return 'text-success'
  if (severity === 'warn')
    return 'text-warning'
  return 'text-error'
}

const findingItems = computed(() =>
  (report.value?.findings ?? []).map(f => ({ ...f, value: f.auditId })),
)

function fractionClass(passed: number | undefined, total: number | undefined): string {
  if (!total)
    return 'text-muted'
  switch (scoreBand(passed != null ? passed / total : null)) {
    case 'good': return 'text-success'
    case 'average': return 'text-warning'
    default: return 'text-error'
  }
}

function llmsIcon(status: string | undefined): string {
  if (status === 'present')
    return 'success'
  if (status === 'missing' || status === 'unknown')
    return 'minus'
  return 'error'
}

function llmsColor(status: string | undefined): string {
  if (status === 'present')
    return 'text-success'
  if (status === 'missing' || status === 'unknown')
    return 'text-muted'
  return 'text-error'
}

function llmsLabel(status: string | undefined): string {
  switch (status) {
    case 'present': return 'Present'
    case 'missing': return 'Optional'
    case 'invalid': return 'Invalid'
    case 'fetch-failed': return 'Fetch failed'
    default: return 'Unknown'
  }
}
</script>

<template>
  <CategoryPageShell
    title="Agentic Browsing"
    pack="agentic-browsing"
    :status="status"
    :error="agenticError"
    :on-retry="refreshAgentic"
    :report="report"
    empty-message="No agentic browsing data available. Run a scan first."
    loading-message="Loading agentic browsing data..."
  >
    <template v-if="report">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
          <div class="numerals-display text-2xl">
            {{ report.routesAnalysed ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Routes Analysed
          </div>
        </div>
        <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
          <div class="numerals-display text-2xl" :class="fractionClass(report.passedChecks, report.totalChecks)">
            {{ report.totalChecks ? `${report.passedChecks ?? 0}/${report.totalChecks}` : '—' }}
          </div>
          <div class="text-xs text-muted">
            Passed Checks
          </div>
        </div>
        <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
          <UiIcon :name="llmsIcon(report.llmsTxt?.status)" :class="llmsColor(report.llmsTxt?.status)" class="size-6 mx-auto mb-1" />
          <div class="text-xs text-muted">
            llms.txt {{ llmsLabel(report.llmsTxt?.status) }}
          </div>
        </div>
        <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
          <div class="numerals-display text-2xl">
            {{ report.webmcp?.registeredToolCount ?? report.webmcp?.routesWithTools ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Registered Tools
          </div>
        </div>
      </div>

      <UiCard v-if="report.webmcp" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">
            WebMCP
          </h3>
        </template>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-3 border rounded-lg text-center">
            <UiIcon
              :name="report.webmcp.supported === false ? 'minus' : report.webmcp.hasRegisteredTools ? 'success' : 'error'"
              :class="report.webmcp.supported === false ? 'text-muted' : report.webmcp.hasRegisteredTools ? 'text-success' : 'text-muted'"
              class="size-5 mx-auto mb-1"
            />
            <div class="text-xs text-muted">
              {{ report.webmcp.supported === false ? 'WebMCP Unsupported' : 'Registered Tools' }}
            </div>
          </div>
          <div class="p-3 border rounded-lg text-center">
            <div class="text-lg font-bold tabular-nums">
              {{ report.webmcp.routesMissingFormAnnotations ?? 0 }}
            </div>
            <div class="text-xs text-muted">
              Routes Missing Form Annotations
            </div>
          </div>
          <div class="p-3 border rounded-lg text-center">
            <UiIcon
              :name="report.webmcp.schemaValid ? 'success' : report.webmcp.schemaValid === false ? 'error' : 'minus'"
              :class="report.webmcp.schemaValid ? 'text-success' : report.webmcp.schemaValid === false ? 'text-error' : 'text-muted'"
              class="size-5 mx-auto mb-1"
            />
            <div class="text-xs text-muted">
              Schema Valid
            </div>
          </div>
          <div class="p-3 border rounded-lg text-center">
            <div class="text-lg font-bold tabular-nums">
              {{ report.stability?.passingCount ?? 0 }}/{{ report.stability?.routeCount ?? 0 }}
            </div>
            <div class="text-xs text-muted">
              CLS Stable
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
              <UiIcon :name="severityIcon(finding.severity)" :class="severityColor(finding.severity)" class="size-4 shrink-0" />
              <span class="truncate">{{ finding.title || finding.auditId }}</span>
              <UBadge :color="severityVariant(finding.severity)" variant="soft" class="text-[10px] shrink-0">
                {{ finding.passingRouteCount }}/{{ finding.routeCount }} pass
              </UBadge>
            </div>
          </template>
          <template #content="{ item: finding }">
            <div v-if="finding.failingRoutes?.length" class="text-xs text-muted pb-2">
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

      <div v-if="!report.findings?.length" class="text-center py-12 text-muted">
        No agentic browsing issues found.
      </div>
    </template>
  </CategoryPageShell>
</template>
