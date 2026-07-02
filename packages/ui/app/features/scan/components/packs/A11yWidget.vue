<script setup lang="ts">
import type { A11yReport } from '@unlighthouse/contracts/packs'
import PackFindings from '~/features/scan/components/PackFindings.vue'
// See CwvWidget.vue for why `report` arrives untyped and gets cast here.
const props = defineProps<{ report: unknown, scanBase?: string }>()

const report = computed(() => props.report as A11yReport)
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
      <UiStat card title="Total Violations" :value="report.totalViolations" value-class="text-error" />
      <UiStat card title="Critical Rules" :value="report.severityCounts.critical" :value-class="report.severityCounts.critical > 0 ? 'text-error' : 'text-success'" />
      <UiStat card title="Unique Rules" :value="report.findings.length" />
      <UiStat card title="Routes Analysed" :value="report.routesAnalysed" value-class="text-success" />
    </div>

    <!-- Findings: shared accordion + a11y-specific element preview body slot
         for fix-hint + element snippets. -->
    <PackFindings :findings="report.findings" title="Accessibility Issues">
      <template #finding-body="{ finding }">
        <p v-if="finding.description" class="text-muted text-xs">
          {{ finding.description }}
        </p>
        <p v-if="finding.fixHint" class="text-xs bg-elevated p-2 rounded">
          {{ finding.fixHint }}
        </p>
        <div v-if="finding.topElements?.length" class="space-y-2">
          <div v-for="(el, i) in finding.topElements" :key="i" class="rounded border p-2">
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
      icon="shield-check"
      title="All routes pass · 0 accessibility violations"
      description="No WCAG issues found across the audited routes."
      compact
    />
  </div>
</template>
