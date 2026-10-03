<script setup lang="ts">
import { useAffectedRouteLinks } from '~/features/scan/affected-route-links'
// App-global findings accordion: severity/count heading plus expandable finding
// rows. Consumers own report-specific body details through the finding-body slot.

// Index signature so report-specific fields (a11y's `fixHint` + `elements`,
// images' `imageUrl`, etc.) flow through the slot without the consumer needing
// to cast. The shared layer only relies on the named fields below.
interface Finding {
  auditId: string
  severity: 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | string
  title?: string | null
  description?: string | null
  routeCount?: number
  routes?: string[]
  [extra: string]: unknown
}

interface Props {
  findings: Finding[]
  title?: string
  // Cap on the routes-list rendered under each finding; the rest collapses to
  // "+N more". Keep small for table-of-contents feel.
  maxRoutesPerFinding?: number
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Issues',
  maxRoutesPerFinding: 10,
})
const { affectedRouteLink, linksPending, linksError, refreshLinks } = useAffectedRouteLinks()

function undisplayedRoutes(finding: Finding): number {
  const displayed = Math.min(finding.routes?.length ?? 0, props.maxRoutesPerFinding)
  return Math.max(0, (finding.routeCount ?? finding.routes?.length ?? 0) - displayed)
}

function severityVariant(severity: string): SemanticStatus {
  if (severity === 'critical' || severity === 'serious')
    return 'error'
  if (severity === 'moderate')
    return 'warning'
  if (severity === 'info')
    return 'info'
  return 'neutral'
}

// Preserve the index signature through the UAccordion item slot.
type AccordionItem = Finding & { value: string, label: string }
const accordionItems = computed<AccordionItem[]>(() =>
  props.findings.map(f => ({ ...f, value: f.auditId, label: f.title || f.auditId })),
)
</script>

<template>
  <UiCard v-if="findings?.length" size="sm">
    <template #header>
      <h2 class="text-label text-muted flex items-center gap-2">
        {{ title }}
        <UiChip purpose="count">
          {{ findings.length }}
        </UiChip>
      </h2>
    </template>
    <QueryError v-if="linksError" :error="linksError" :on-retry="refreshLinks" />
    <p v-else-if="linksPending" role="status" class="pb-2 text-sm text-muted">
      Loading affected route links
    </p>
    <UAccordion :items="accordionItems" type="multiple" class="w-full">
      <template #default="{ item: finding }">
        <div class="flex items-center gap-3 text-left flex-1 min-w-0 text-sm">
          <UiChip purpose="status" :status="severityVariant(finding.severity)" class="shrink-0 capitalize">
            {{ finding.severity }}
          </UiChip>
          <span class="truncate">{{ finding.title || finding.auditId }}</span>
          <span v-if="finding.routeCount != null" class="text-xs text-muted shrink-0 ml-auto">
            {{ finding.routeCount }} route{{ finding.routeCount === 1 ? '' : 's' }}
          </span>
        </div>
      </template>
      <template #content="{ item: finding }">
        <div class="text-sm space-y-2 pb-2">
          <slot name="finding-body" :finding="finding">
            <p v-if="finding.description" class="text-muted text-xs">
              {{ finding.description }}
            </p>
          </slot>

          <div v-if="finding.routes?.length" class="text-sm text-muted">
            Affected routes:
            <ul class="mt-1 space-y-0.5 font-mono">
              <li v-for="r in finding.routes.slice(0, maxRoutesPerFinding)" :key="r">
                <NuxtLink v-if="affectedRouteLink(r)" :to="affectedRouteLink(r)" class="inline-flex min-h-11 items-center break-all hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-h-6">
                  {{ r }}
                </NuxtLink>
                <span v-else class="break-all">{{ r }}</span>
              </li>
              <li v-if="undisplayedRoutes(finding)">
                +{{ undisplayedRoutes(finding) }} more
              </li>
            </ul>
          </div>
        </div>
      </template>
    </UAccordion>
  </UiCard>
</template>
