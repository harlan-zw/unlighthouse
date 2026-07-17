<script setup lang="ts">
import type { ImagesReport } from '@unlighthouse/contracts/packs'
// See CwvWidget.vue for why `report` arrives untyped and gets cast here.
const props = defineProps<{ report: unknown, scanBase?: string }>()

const { fmtBytes, fmtMs } = createFormatters()

const report = computed(() => props.report as ImagesReport)

function severityStatus(severity: string): 'error' | 'warning' | 'neutral' {
  if (severity === 'critical' || severity === 'serious')
    return 'error'
  if (severity === 'moderate')
    return 'warning'
  return 'neutral'
}

// Image findings → UAccordion items (stable value = imageUrl). Capped to 20
// by default so a noisy report doesn't flood the page; the user can expand
// to the full list on demand.
const IMAGE_CAP = 20
const showAllImages = ref(false)
const allImageFindings = computed(() => report.value?.findings ?? [])
const hiddenImageCount = computed(() => Math.max(0, allImageFindings.value.length - IMAGE_CAP))
const imageItems = computed(() =>
  (showAllImages.value ? allImageFindings.value : allImageFindings.value.slice(0, IMAGE_CAP))
    .map(f => ({ ...f, value: f.imageUrl })),
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-heading">
        Images
      </h2>
      <UiButton purpose="link" size="sm" icon="list" :to="`${scanBase}/routes`">
        View routes
      </UiButton>
    </div>

    <UiCard v-if="report.findings?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed flex items-center gap-2">
          <UiIcon name="image" class="size-4" />
          Image Optimization
          <UiChip purpose="count">
            {{ report.findings.length }} issues
          </UiChip>
          <UiChip v-if="report.totalBytesSavable > 0" purpose="status" status="warning">
            {{ fmtBytes(report.totalBytesSavable) }} savable
          </UiChip>
        </h3>
      </template>
      <div v-if="report.severityCounts" class="flex gap-2 flex-wrap mb-4">
        <UiChip v-if="report.severityCounts.critical > 0" purpose="status" status="error">
          {{ report.severityCounts.critical }} critical
        </UiChip>
        <UiChip v-if="report.severityCounts.serious > 0" purpose="status" status="error">
          {{ report.severityCounts.serious }} serious
        </UiChip>
        <UiChip v-if="report.severityCounts.moderate > 0" purpose="status" status="warning">
          {{ report.severityCounts.moderate }} moderate
        </UiChip>
        <UiChip v-if="report.severityCounts.minor > 0" purpose="tag">
          {{ report.severityCounts.minor }} minor
        </UiChip>
      </div>
      <UAccordion :items="imageItems" type="multiple" class="w-full">
        <template #default="{ item: finding }">
          <div class="flex items-center gap-3 text-left flex-1 min-w-0 text-sm">
            <UiChip purpose="status" :status="severityStatus(finding.severity)">
              {{ finding.severity }}
            </UiChip>
            <span class="min-w-0 break-all font-mono text-xs line-clamp-2">{{ finding.imageUrl }}</span>
            <span class="text-xs text-muted shrink-0">{{ finding.routeCount }} routes</span>
          </div>
        </template>
        <template #content="{ item: finding }">
          <div class="text-sm space-y-3 pb-2">
            <div class="flex gap-4 items-start">
              <!-- The actual offending image — referrerpolicy=no-referrer
                         so origin servers that block hotlinking still render
                         (we're loading their public asset, not stealing it). -->
              <a :href="finding.imageUrl" target="_blank" rel="noopener noreferrer" class="shrink-0" :aria-label="`Open image: ${finding.imageUrl}`">
                <img
                  :src="finding.imageUrl"
                  width="128"
                  height="80"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  alt=""
                  class="w-32 h-20 object-contain bg-elevated rounded border"
                  @error="(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none' }"
                >
              </a>
              <div class="flex-1 min-w-0 space-y-2">
                <div class="flex gap-2 flex-wrap">
                  <UiChip purpose="count">
                    {{ finding.kind }}
                  </UiChip>
                  <UiChip v-if="finding.wastedBytes" purpose="status" status="warning">
                    {{ fmtBytes(finding.wastedBytes) }} wasted
                  </UiChip>
                  <UiChip v-if="finding.lcpImpactMs" purpose="status" status="error">
                    LCP +{{ fmtMs(finding.lcpImpactMs) }}
                  </UiChip>
                </div>
                <p v-if="finding.reason" class="text-xs text-muted">
                  {{ finding.reason }}
                </p>
                <div v-if="finding.routes?.length" class="text-xs text-muted">
                  <ul class="mt-1 space-y-0.5 font-mono">
                    <li v-for="r in finding.routes" :key="r">
                      {{ r }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </template>
      </UAccordion>
      <div v-if="hiddenImageCount > 0 || showAllImages" class="mt-3 text-center">
        <UiButton purpose="quiet" size="sm" :icon="showAllImages ? 'chevron-up' : 'chevron-down'" @click="showAllImages = !showAllImages">
          {{ showAllImages ? 'Show fewer' : `Show ${hiddenImageCount} more image ${hiddenImageCount === 1 ? 'issue' : 'issues'}` }}
        </UiButton>
      </div>
    </UiCard>

    <UiEmptyState
      v-else
      icon="image"
      title="All routes pass · 0 image issues"
      description="No oversized, unoptimized or render-blocking images found."
      compact
    />
  </div>
</template>
