<script setup lang="ts">
// The "findings accordion" used by a11y-quick-wins, seo-basics,
// agentic-browsing, and most of the other pack pages. Each finding is
// an audit-grouped finding with severity, title, description, an
// affected-routes list. Five pages were rendering the same block
// with slight copy variation; co-locate it here.

// Index signature so pack-specific fields (a11y's `fixHint` +
// `elements`, images' `imageUrl`, etc.) flow through the slot without
// the consumer needing to cast. The shared layer only relies on the
// named fields above.
interface Finding {
  auditId: string
  severity: 'critical' | 'serious' | 'moderate' | 'minor' | 'info' | string
  title?: string | null
  description?: string | null
  routeCount?: number
  routes?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [extra: string]: any
}

interface Props {
  findings: Finding[]
  title?: string
  // Cap on the routes-list rendered under each finding; the rest
  // collapses to "+N more". Keep small for table-of-contents feel.
  maxRoutesPerFinding?: number
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Issues',
  maxRoutesPerFinding: 10,
})

function severityBadge(severity: string): { color: 'error' | 'neutral', variant: 'solid' | 'subtle' | 'outline' } {
  if (severity === 'critical' || severity === 'serious') return { color: 'error', variant: 'solid' }
  if (severity === 'moderate') return { color: 'neutral', variant: 'subtle' }
  return { color: 'neutral', variant: 'outline' }
}

// UAccordion needs a stable items array keyed by `value`; the per-finding
// trigger/body markup lives in the generic `#default` / `#content` scoped
// slots below (each receives `{ item }`) so all original copy + the
// finding-body passthrough slot are preserved.
const accordionItems = computed(() =>
  props.findings.map(finding => ({
    finding,
    value: finding.auditId,
  })),
)
</script>

<template>
  <UCard v-if="findings?.length">
    <template #header>
      <h3 class="text-sm font-medium text-muted flex items-center gap-2">
        {{ title }}
        <UBadge color="neutral" variant="subtle" class="text-xs">
          {{ findings.length }}
        </UBadge>
      </h3>
    </template>
    <UAccordion type="multiple" :items="accordionItems" class="w-full">
      <template #default="{ item }">
        <div class="flex items-center gap-3 text-left flex-1 min-w-0 text-sm">
          <UBadge :color="severityBadge(item.finding.severity).color" :variant="severityBadge(item.finding.severity).variant" class="text-[10px] shrink-0 capitalize">
            {{ item.finding.severity }}
          </UBadge>
          <span class="truncate">{{ item.finding.title || item.finding.auditId }}</span>
          <span v-if="item.finding.routeCount != null" class="text-xs text-muted shrink-0 ml-auto">
            {{ item.finding.routeCount }} route{{ item.finding.routeCount === 1 ? '' : 's' }}
          </span>
        </div>
      </template>
      <template #content="{ item }">
        <div class="text-sm space-y-2">
          <!-- Slot for the per-pack extra body (image preview, code
               snippet, etc.). Receives the finding so the consumer
               can decide what to render. -->
          <slot name="finding-body" :finding="item.finding">
            <p v-if="item.finding.description" class="text-muted text-xs">
              {{ item.finding.description }}
            </p>
          </slot>

          <div v-if="item.finding.routes?.length" class="text-xs text-muted">
            Affected routes:
            <ul class="mt-1 space-y-0.5 font-mono">
              <li v-for="r in item.finding.routes.slice(0, maxRoutesPerFinding)" :key="r">
                {{ r }}
              </li>
              <li v-if="item.finding.routes.length > maxRoutesPerFinding">
                +{{ item.finding.routes.length - maxRoutesPerFinding }} more
              </li>
            </ul>
          </div>
        </div>
      </template>
    </UAccordion>
  </UCard>
</template>
