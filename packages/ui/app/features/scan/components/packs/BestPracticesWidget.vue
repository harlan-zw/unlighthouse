<script setup lang="ts">
import type { BestPracticesReport } from '@unlighthouse/contracts/packs'
import PackFindings from '~/features/scan/components/PackFindings.vue'
// See CwvWidget.vue for why `report` arrives untyped and gets cast here.
const props = defineProps<{ report: unknown, scanBase: string }>()

const report = computed(() => props.report as BestPracticesReport)

// PackFindings' shared `Finding` interface only names the fields common to
// every pack (auditId/severity/title/…); `sampleElements` is best-practices-
// specific, so it flows through the finding-body slot via Finding's index
// signature as `unknown`. Narrow it here rather than in the template.
type SampleElement = BestPracticesReport['findings'][number]['sampleElements'][number]
function sampleElementsOf(finding: Record<string, unknown>): SampleElement[] {
  return Array.isArray(finding.sampleElements) ? finding.sampleElements as SampleElement[] : []
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Best Practices
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes?sort=scoreBestPractices:asc`">
        View routes
      </UiButton>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UiStat card title="Critical" :value="report.severityCounts.critical" :value-class="report.severityCounts.critical > 0 ? 'text-error' : 'text-success'" />
      <UiStat card title="Serious" :value="report.severityCounts.serious" :value-class="report.severityCounts.serious > 0 ? 'text-error' : 'text-success'" />
      <UiStat card title="Moderate" :value="report.severityCounts.moderate" :value-class="report.severityCounts.moderate > 0 ? 'text-warning' : 'text-success'" />
      <UiStat card title="Minor" :value="report.severityCounts.minor" />
    </div>

    <!-- Findings via the shared accordion — sampleElements gets the same
         element-preview body slot a11y/seo use. -->
    <PackFindings :findings="report.findings" title="Best Practices Issues">
      <template #finding-body="{ finding }">
        <p v-if="finding.description" class="text-muted text-xs">
          {{ finding.description }}
        </p>
        <p v-if="finding.fixHint" class="text-xs bg-elevated p-2 rounded">
          {{ finding.fixHint }}
        </p>
        <div v-if="sampleElementsOf(finding).length" class="space-y-2">
          <div v-for="(el, i) in sampleElementsOf(finding)" :key="i" class="rounded border p-2">
            <code class="text-xs bg-elevated px-1.5 py-0.5 rounded">{{ el.selector || el.snippet }}</code>
            <div v-if="el.nodeLabel" class="text-xs text-muted mt-1">
              {{ el.nodeLabel }}
            </div>
          </div>
        </div>
      </template>
    </PackFindings>

    <UiEmptyState
      v-if="!report.findings.length"
      icon="success"
      title="All routes pass · 0 best practices issues"
      description="No best-practices audits failed across the audited routes."
      compact
    />
  </div>
</template>
