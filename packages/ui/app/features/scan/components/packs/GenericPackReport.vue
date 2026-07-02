<script setup lang="ts">
// The "custom packs render for free" surface (D-045). Packs without a
// dedicated widget — third-party / community packs installed via
// `unlighthouse.config.ts`'s `packs` channel (D-046) — land here. Three
// tiers, all optional and independent:
//
//   1. severityCounts badge row, when the report has one (any string-keyed
//      record of non-negative counts — not just the built-in critical/
//      serious/moderate/minor vocabulary).
//   2. findings[] through the shared FindingsAccordion, when items look
//      convention-shaped (an id/auditId + a severity).
//   3. A raw, collapsible JSON block — always available as an escape hatch,
//      expanded by default only when neither tier above found anything to
//      render (i.e. it's the ONLY content, not a redundant dump next to a
//      well-rendered report).
const props = defineProps<{ report: unknown, scanBase?: string }>()

interface GenericFinding {
  auditId: string
  severity: string
  title?: string | null
  description?: string | null
  routeCount?: number
  routes?: string[]
  [extra: string]: unknown
}

const reportObj = computed<Record<string, unknown> | null>(() =>
  props.report && typeof props.report === 'object' && !Array.isArray(props.report)
    ? props.report as Record<string, unknown>
    : null,
)

const severityCounts = computed<Record<string, number> | null>(() => {
  const sc = reportObj.value?.severityCounts
  if (!sc || typeof sc !== 'object' || Array.isArray(sc))
    return null
  const entries = Object.entries(sc as Record<string, unknown>).filter(([, v]) => typeof v === 'number')
  return entries.length ? Object.fromEntries(entries) as Record<string, number> : null
})

function isFindingShaped(item: unknown): item is Record<string, unknown> & { severity: string } {
  if (!item || typeof item !== 'object')
    return false
  const rec = item as Record<string, unknown>
  return typeof rec.severity === 'string' && (typeof rec.auditId === 'string' || typeof rec.id === 'string')
}

const findings = computed<GenericFinding[] | null>(() => {
  const list = reportObj.value?.findings
  if (!Array.isArray(list) || !list.length || !list.every(isFindingShaped))
    return null
  return list.map(item => ({ ...item, auditId: (item.auditId as string) ?? (item.id as string) }) as GenericFinding)
})

const hasStructuredContent = computed(() => !!severityCounts.value || !!findings.value)
const rawOpen = ref(false)
const rawJson = computed(() => JSON.stringify(props.report, null, 2))

// Default the raw block open when there's nothing else to show — it becomes
// the primary content instead of a redundant dump alongside a rendered report.
watchEffect(() => {
  rawOpen.value = !hasStructuredContent.value
})

function severityStatus(key: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  const k = key.toLowerCase()
  if (['critical', 'serious', 'poor', 'fail', 'error'].includes(k))
    return 'error'
  if (['moderate', 'needsimprovement', 'warn', 'warning'].includes(k))
    return 'warning'
  if (['good', 'pass', 'success'].includes(k))
    return 'success'
  if (['info', 'minor'].includes(k))
    return 'info'
  return 'neutral'
}
</script>

<template>
  <div class="space-y-6">
    <UiEmptyState v-if="!reportObj" icon="inbox" title="Run this pack to render report data." compact />

    <template v-else>
      <div v-if="severityCounts" class="flex flex-wrap gap-2">
        <UiChip v-for="(count, key) in severityCounts" :key="key" purpose="status" :status="severityStatus(key)" tabular>
          {{ count }} {{ key }}
        </UiChip>
      </div>

      <FindingsAccordion v-if="findings" :findings="findings" title="Findings" />

      <UiCard size="sm">
        <Disclosure v-model:open="rawOpen" label="Raw report JSON">
          <CodeBlock v-if="rawOpen" :code="rawJson" class="mt-2" />
        </Disclosure>
      </UiCard>
    </template>
  </div>
</template>
