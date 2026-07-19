<script setup lang="ts">
import type { A11yReport } from '@unlighthouse/contracts/packs'
import { A11yReportSchema } from '@unlighthouse/contracts/packs'

const props = defineProps<{ report: unknown, scanBase?: string }>()

const report = computed(() => A11yReportSchema.parse(props.report))

// FindingsAccordion exposes the cross-pack finding fields; `topElements` is
// a11y-specific, so narrow it in script before the template iterates it.
type TopElement = A11yReport['findings'][number]['topElements'][number]
function isTopElement(value: unknown): value is TopElement {
  if (!value || typeof value !== 'object')
    return false
  return 'selector' in value
    && typeof value.selector === 'string'
    && 'snippet' in value
    && (value.snippet === null || typeof value.snippet === 'string')
    && 'nodeLabel' in value
    && (value.nodeLabel === null || typeof value.nodeLabel === 'string')
    && 'firstSeenOn' in value
    && typeof value.firstSeenOn === 'string'
}

function topElementsOf(finding: Record<string, unknown>): TopElement[] {
  return Array.isArray(finding.topElements) ? finding.topElements.filter(isTopElement) : []
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Accessibility
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes?sort=scoreAccessibility:asc`">
        View routes
      </UiButton>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UiStat card title="Total Violations" :value="report.totalViolations" value-class="text-error" :animated-value="false" />
      <UiStat card title="Critical Rules" :value="report.severityCounts.critical" :value-class="report.severityCounts.critical > 0 ? 'text-error' : 'text-success'" :animated-value="false" />
      <UiStat card title="Unique Rules" :value="report.findings.length" :animated-value="false" />
      <UiStat card title="Routes Analysed" :value="report.routesAnalysed" value-class="text-success" :animated-value="false" />
    </div>

    <!-- Findings: shared accordion + a11y-specific element preview body slot
         for fix-hint + element snippets. -->
    <FindingsAccordion :findings="report.findings" title="Accessibility Issues">
      <template #finding-body="{ finding }">
        <p v-if="finding.description" class="text-muted text-xs">
          {{ finding.description }}
        </p>
        <p v-if="finding.fixHint" class="text-xs bg-elevated p-2 rounded">
          {{ finding.fixHint }}
        </p>
        <div v-if="topElementsOf(finding).length" class="space-y-2">
          <div v-for="(el, i) in topElementsOf(finding)" :key="i" class="rounded border p-2">
            <CodeBlock inline :code="el.selector || el.snippet || ''" />
            <div v-if="el.nodeLabel" class="text-xs text-muted mt-1">
              {{ el.nodeLabel }}
            </div>
          </div>
        </div>
      </template>
    </FindingsAccordion>

    <UiEmptyState
      v-if="!report.findings.length"
      icon="shield-check"
      title="All routes pass · 0 accessibility violations"
      description="No WCAG issues found across the audited routes."
      compact
    />
  </div>
</template>
