<script setup lang="ts">
import type { A11yReport } from '@unlighthouse/contracts/packs'
import CategoryPageShell from '~/features/scan/components/CategoryPageShell.vue'
import PackFindings from '~/features/scan/components/PackFindings.vue'
import { getScanId } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

const scanId = getScanId()

const { data: a11yPack, status, error: a11yError, refresh: refreshA11y } = useApiQuery('pack.run', () => ({ scanId, pack: 'a11y-quick-wins' }))

const a11yReport = computed(() => (a11yPack.value?.report ?? null) as A11yReport | null)
</script>

<template>
  <CategoryPageShell
    title="Accessibility"
    pack="a11y-quick-wins"
    :status="status"
    :error="a11yError"
    :on-retry="refreshA11y"
    :report="a11yReport"
    empty-message="No accessibility data available. Run a scan first."
    loading-message="Loading accessibility data..."
  >
    <template v-if="a11yReport">
      <!-- A11y-specific summary stats. -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <UiStat card title="Total Violations" :value="a11yReport.totalViolations" value-class="text-error" />
        <UiStat card title="Critical Rules" :value="a11yReport.severityCounts.critical" :value-class="a11yReport.severityCounts.critical > 0 ? 'text-error' : 'text-success'" />
        <UiStat card title="Unique Rules" :value="a11yReport.findings.length" />
        <UiStat card title="Routes Analysed" :value="a11yReport.routesAnalysed" value-class="text-success" />
      </div>

      <!-- Findings: shared accordion + a11y-specific element preview
           body slot for fix-hint + element snippets. -->
      <PackFindings :findings="a11yReport.findings" title="Accessibility Issues">
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

      <div v-if="!a11yReport.findings.length" class="text-center py-12 text-muted">
        No accessibility issues found.
      </div>
    </template>
  </CategoryPageShell>
</template>
