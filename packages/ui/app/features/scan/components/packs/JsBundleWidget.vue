<script setup lang="ts">
import type { BundleReport } from '@unlighthouse/contracts/packs'
// See CwvWidget.vue for why `report` arrives untyped and gets cast here.
const props = defineProps<{ report: unknown, scanBase?: string }>()

const { fmtBytes } = createFormatters()

const report = computed(() => props.report as BundleReport)

// js-bundle findings are keyed by `kind` + `resource`, not a title/auditId
// convention, so they don't go through FindingsAccordion.
const BUNDLE_KIND_LABELS: Record<string, string> = {
  'unused-js': 'Unused JavaScript',
  'unused-css': 'Unused CSS',
  'third-party': 'Third-party script',
  'render-blocking': 'Render-blocking resource',
  'legacy-js': 'Legacy JavaScript',
  'duplicated-js': 'Duplicated JavaScript',
}
function bundleKindLabel(kind: string): string {
  return BUNDLE_KIND_LABELS[kind] ?? kind
}
function shortResource(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`
  }
  catch (_err) {
    // Non-URL resource labels are already displayable.
    return url
  }
}

// Same critical/serious/moderate/minor/info → status mapping the other
// findings-based widgets use (see FindingsAccordion's severityVariant), so JS
// Bundle severity renders colored instead of a raw uncolored label.
function severityStatus(severity: string): SemanticStatus {
  if (severity === 'critical' || severity === 'serious')
    return 'error'
  if (severity === 'moderate')
    return 'warning'
  return 'neutral'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        JS Bundle
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes`">
        View routes
      </UiButton>
    </div>

    <UiCard v-if="report.findings?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed flex items-center gap-2">
          JS Bundle Issues
          <UiChip purpose="count">
            {{ report.findings.length }}
          </UiChip>
          <UiChip v-if="report.totalBytesSavable > 0" purpose="status" status="warning">
            {{ fmtBytes(report.totalBytesSavable) }} savable
          </UiChip>
        </h3>
      </template>
      <div class="space-y-3">
        <div v-for="(finding, idx) in report.findings" :key="`${finding.kind}-${finding.resource}-${idx}`" class="p-3 border rounded-lg">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium flex items-center gap-2">
                <UiChip purpose="status" :status="severityStatus(finding.severity)" class="capitalize">
                  {{ finding.severity }}
                </UiChip>
                {{ bundleKindLabel(finding.kind) }}
              </div>
              <UiTooltip v-if="finding.resource" :text="finding.resource" side="top" size="lg">
                <div class="text-xs text-muted font-mono truncate mt-1">
                  {{ shortResource(finding.resource) }}
                </div>
              </UiTooltip>
            </div>
            <UiChip purpose="count">
              {{ finding.routeCount }} route{{ finding.routeCount === 1 ? '' : 's' }}
            </UiChip>
          </div>
          <div v-if="finding.wastedBytes" class="text-xs text-warning mt-2">
            {{ fmtBytes(finding.wastedBytes) }} wasted<span v-if="finding.wastedPercent"> ({{ finding.wastedPercent }}%)</span>
          </div>
          <div v-if="finding.fixHint" class="text-xs text-muted mt-1">
            {{ finding.fixHint }}
          </div>
        </div>
      </div>
    </UiCard>

    <UiEmptyState
      v-else
      icon="code"
      title="All routes pass · 0 JS bundle issues"
      description="No unused, duplicated or render-blocking bundle issues found."
      compact
    />
  </div>
</template>
