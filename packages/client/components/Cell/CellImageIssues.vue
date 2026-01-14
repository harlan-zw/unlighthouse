<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

// Cache audit keys for performance
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

  // Use native reduce instead of lodash sum for better performance
  return IMAGE_AUDIT_KEYS.reduce((total, key) =>
    total + (audits[key]?.details.items.length || 0), 0)
})
</script>

<template>
  <div>
    <audit-result :value="{ displayValue: imageIssues, score: imageIssues === 0 ? 1 : 0 }" />
  </div>
</template>
