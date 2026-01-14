<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const IMAGE_AUDIT_KEYS = [
  'unsized-images',
  'preload-lcp-image',
  'offscreen-images',
  'modern-image-formats',
  'uses-optimized-images',
  'efficient-animated-content',
  'uses-responsive-images',
] as const

const imageIssues = computed(() => {
  const audits = props.report.report?.audits
  if (!audits)
    return 0

  return IMAGE_AUDIT_KEYS.reduce((total, key) => {
    const details = audits[key]?.details as any
    return total + (details?.items?.length || 0)
  }, 0)
})
</script>

<template>
  <div>
    <AuditResult :value="{ displayValue: String(imageIssues), score: imageIssues === 0 ? 1 : 0 }" />
  </div>
</template>
