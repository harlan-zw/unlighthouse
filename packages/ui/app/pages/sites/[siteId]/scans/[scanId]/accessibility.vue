<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'

definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()

const { data: a11yPack, status } = useAsyncData(
  `a11y-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'a11y-quick-wins' }).catch(() => null),
)

const a11yReport = computed(() => (a11yPack.value as any)?.report ?? null)
</script>

<template>
  <CategoryPageShell
    title="Accessibility"
    pack="a11y-quick-wins"
    :status="status"
    :report="a11yReport"
    empty-message="No accessibility data available. Run a scan first."
    loading-message="Loading accessibility data..."
  >
    <!-- A11y-specific summary stats. -->
    <div v-if="a11yReport.summary" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold text-destructive tabular-nums">
            {{ a11yReport.summary?.totalFindings ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Total Issues
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="numerals-display text-2xl">
            {{ a11yReport.summary?.routesAffected ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Routes Affected
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="numerals-display text-2xl">
            {{ a11yReport.summary?.uniqueRules ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Unique Rules
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold text-success tabular-nums">
            {{ a11yReport.routesAnalysed ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Routes Analysed
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Findings: shared accordion + a11y-specific element preview
         body slot for fix-hint + element snippets. -->
    <PackFindings :findings="a11yReport.findings ?? []" title="Accessibility Issues">
      <template #finding-body="{ finding }">
        <p v-if="finding.description" class="text-muted-foreground text-xs">
          {{ finding.description }}
        </p>
        <p v-if="finding.fixHint" class="text-xs bg-muted p-2 rounded">
          {{ finding.fixHint }}
        </p>
        <div v-if="finding.elements?.length" class="space-y-2">
          <div v-for="(el, i) in finding.elements.slice(0, 10)" :key="i" class="rounded border p-2">
            <code class="text-xs bg-muted px-1.5 py-0.5 rounded">{{ el.selector || el.snippet }}</code>
            <div v-if="el.nodeLabel" class="text-xs text-muted-foreground mt-1">
              {{ el.nodeLabel }}
            </div>
          </div>
          <p v-if="finding.elements.length > 10" class="text-xs text-muted-foreground text-center">
            +{{ finding.elements.length - 10 }} more elements
          </p>
        </div>
      </template>
    </PackFindings>

    <div v-if="!a11yReport.findings?.length" class="text-center py-12 text-muted-foreground">
      No accessibility issues found.
    </div>
  </CategoryPageShell>
</template>
