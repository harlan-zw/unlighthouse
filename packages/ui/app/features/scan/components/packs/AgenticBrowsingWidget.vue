<script setup lang="ts">
import type { AgenticBrowsingReport } from '@unlighthouse/contracts/packs'
// See CwvWidget.vue for why `report` arrives untyped and gets cast here.
const props = defineProps<{ report: unknown, scanBase?: string }>()

const report = computed(() => props.report as AgenticBrowsingReport)

// Agentic Browsing has its own pass/fail-based severity (vs the
// critical/serious/moderate scheme PackFindings handles) so findings render
// inline rather than via the shared component.
function severityStatus(severity: string): 'error' | 'warning' | 'neutral' {
  if (severity === 'fail')
    return 'error'
  if (severity === 'warn')
    return 'warning'
  return 'neutral'
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

function llmsStatus(status: string | undefined): SemanticStatus {
  if (status === 'present')
    return 'success'
  if (status === 'missing' || status === 'unknown')
    return 'neutral'
  return 'error'
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
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Agentic Browsing
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes?sort=scoreAgenticBrowsing:asc`">
        View routes
      </UiButton>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UiStat card title="Routes Analysed" :value="report.routesAnalysed ?? 0" />
      <UiStat
        card
        title="Passed Checks"
        :value="report.totalChecks ? `${report.passedChecks ?? 0}/${report.totalChecks}` : '—'"
        :value-class="fractionClass(report.passedChecks, report.totalChecks)"
      />
      <div class="rounded-lg border border-default bg-[var(--ui-bg-elevated)]/35 p-4 flex items-center justify-center">
        <UiStatusBadge size="md" :status="llmsStatus(report.llmsTxt?.status)" :icon="llmsIcon(report.llmsTxt?.status)" :label="`llms.txt ${llmsLabel(report.llmsTxt?.status)}`" />
      </div>
      <UiStat card title="Registered Tools" :value="report.webmcp?.registeredToolCount ?? report.webmcp?.routesWithTools ?? 0" />
    </div>

    <!-- llms.txt detail — the stat tile above only carries the headline
         status; the route-level breakdown lives here. -->
    <UiCard v-if="report.llmsTxt" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">
          llms.txt
        </h3>
      </template>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-3 border rounded-lg text-center">
          <div class="text-lg font-bold tabular-nums text-success">
            {{ report.llmsTxt.validRoutes }}
          </div>
          <div class="text-xs text-muted">
            Valid
          </div>
        </div>
        <div class="p-3 border rounded-lg text-center">
          <div class="text-lg font-bold tabular-nums" :class="report.llmsTxt.invalidRoutes > 0 ? 'text-error' : ''">
            {{ report.llmsTxt.invalidRoutes }}
          </div>
          <div class="text-xs text-muted">
            Invalid
          </div>
        </div>
        <div class="p-3 border rounded-lg text-center">
          <div class="text-lg font-bold tabular-nums text-muted">
            {{ report.llmsTxt.missingRoutes }}
          </div>
          <div class="text-xs text-muted">
            Missing
          </div>
        </div>
        <div class="p-3 border rounded-lg text-center">
          <div class="text-lg font-bold tabular-nums" :class="report.llmsTxt.fetchFailedRoutes > 0 ? 'text-error' : ''">
            {{ report.llmsTxt.fetchFailedRoutes }}
          </div>
          <div class="text-xs text-muted">
            Fetch failed
          </div>
        </div>
      </div>
    </UiCard>

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
          <UiChip purpose="count">
            {{ report.findings.length }}
          </UiChip>
        </h3>
      </template>
      <UAccordion :items="findingItems" type="multiple" class="w-full">
        <template #default="{ item: finding }">
          <div class="flex items-center gap-3 text-left flex-1 min-w-0 text-sm">
            <UiIcon :name="severityIcon(finding.severity)" :class="severityColor(finding.severity)" class="size-4 shrink-0" />
            <span class="truncate">{{ finding.title || finding.auditId }}</span>
            <UiChip purpose="status" :status="severityStatus(finding.severity)">
              {{ finding.passingRouteCount }}/{{ finding.routeCount }} pass
            </UiChip>
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

    <UiEmptyState
      v-if="!report.findings?.length"
      icon="bot"
      title="All checks pass · 0 agentic-browsing issues"
      description="No WebMCP, llms.txt or agent-accessibility issues found."
      compact
    />
  </div>
</template>
