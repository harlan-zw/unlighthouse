<script setup lang="ts">
import EventStreamPanel from '~/features/scan/components/EventStreamPanel.vue'
import LiveResults from '~/features/scan/components/LiveResults.vue'
import ScanActions from '~/features/scan/components/ScanActions.vue'
import ScanProgress from '~/features/scan/components/ScanProgress.vue'
import ScanStatusBadge from '~/features/scan/components/ScanStatusBadge.vue'
import { useScanOverview } from '~/features/scan/overview'

definePageMeta({ layout: 'scan' })

const {
  scanId,
  scanBase,
  scanMeta,
  siteTitle,
  currentScanIsActive,
  showScanActions,
  showLiveView,
  resolvedStatus,
  scanIsComplete,
  deviceFilter,
  hasMultipleDevices,
  scanSummary,
  scanMetaError,
  scanSummaryError,
  refreshScanMeta,
  refreshSummary,
  rescanningAll,
  categories,
  distribution,
  donutArcs,
  scoreToColor,
  scoreToLabel,
  scoreColor,
  categoryScoreLabel,
  jsonExportUrl,
  csvExportUrl,
  jsonExportName,
  csvExportName,
  handleRescanAll,
} = useScanOverview()

useScanPageTitle('Overview')

const eventsOpen = ref(false)
const { fmtTimestamp } = createFormatters()
</script>

<template>
  <div class="space-y-8">
    <!-- Scan failed to load (unreachable backend / missing scan). Shown above
         everything so it isn't hidden behind empty stat rows. -->
    <QueryError v-if="scanMetaError" :error="scanMetaError" :on-retry="refreshScanMeta" />

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-title truncate max-w-lg">
          {{ siteTitle }}
        </h1>
        <div class="flex items-center gap-2 mt-1.5 text-sm text-muted">
          <ScanStatusBadge :status="resolvedStatus" />
          <UiChip v-if="hasMultipleDevices" purpose="count">
            <UiIcon name="smartphone" class="size-2.5 mr-0.5" />
            <UiIcon name="monitor" class="size-2.5 mr-0.5" />
            both
          </UiChip>
          <UiChip v-else-if="scanMeta?.device" purpose="count">
            <UiIcon :name="scanMeta.device === 'mobile' ? 'smartphone' : 'monitor'" class="size-2.5 mr-0.5" />
            {{ scanMeta.device }}
          </UiChip>
          <span v-if="scanMeta?.startedAt" class="text-xs">{{ fmtTimestamp(scanMeta.startedAt) }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <ScanActions v-if="showScanActions" />
        <UDrawer
          v-model:open="eventsOpen"
          direction="right"
          title="Events"
          description="Live activity from the scan host: route lifecycle, progress and completion events."
          :ui="{ content: 'w-full sm:max-w-2xl' }"
        >
          <UiButton purpose="quiet" size="sm" icon="activity">
            View events
          </UiButton>

          <template #body>
            <EventStreamPanel v-if="eventsOpen" :scan-id="scanId" :scan-base="scanBase" />
          </template>
        </UDrawer>
        <a
          v-if="scanIsComplete && !currentScanIsActive"
          :href="jsonExportUrl"
          :download="jsonExportName"
          aria-description="Self-contained scan data without raw Lighthouse result blobs"
          class="inline-flex items-center gap-1 rounded-md px-2.5 h-8 text-sm ring-1 ring-default text-default hover:bg-elevated transition-colors"
        >
          <UiIcon name="download" class="size-4" />
          Export JSON
        </a>
        <a
          v-if="scanIsComplete && !currentScanIsActive"
          :href="csvExportUrl"
          :download="csvExportName"
          aria-description="Per-route scores and Core Web Vitals for spreadsheet tools"
          class="inline-flex items-center gap-1 rounded-md px-2.5 h-8 text-sm ring-1 ring-default text-default hover:bg-elevated transition-colors"
        >
          <UiIcon name="table" class="size-4" />
          Export CSV
        </a>
        <UiButton v-if="scanIsComplete && !currentScanIsActive" purpose="secondary" size="sm" :loading="rescanningAll" icon="refresh" @click="handleRescanAll">
          Rescan all
        </UiButton>
      </div>
    </div>

    <ScanProgress v-if="showLiveView" />
    <LiveResults v-if="showLiveView" />

    <!-- Device filter (only when scan captured both) -->
    <div v-if="hasMultipleDevices && scanIsComplete && !currentScanIsActive" class="flex items-center gap-2">
      <span class="text-xs text-muted">View as</span>
      <UTabs
        v-model="deviceFilter"
        :content="false"
        size="sm"
        :items="[
          { value: '', label: 'All' },
          { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
          { value: 'desktop', label: 'Desktop', icon: 'monitor' },
        ]"
      />
    </div>

    <!-- Stats row -->
    <div v-if="scanSummary" class="flex items-center gap-8 border-b pb-6">
      <div>
        <div class="text-3xl font-bold tabular-nums">
          {{ scanSummary.routesScanned }}
        </div>
        <div class="text-xs text-muted mt-0.5">
          Routes
        </div>
      </div>
      <div>
        <div class="text-3xl font-bold tabular-nums" :class="scoreToColor(scanSummary.avgScore)">
          {{ scoreToLabel(scanSummary.avgScore) }}
        </div>
        <div class="text-xs text-muted mt-0.5">
          Avg Score
        </div>
      </div>
      <DistributionBar v-if="distribution" :segments="distribution.segments" class="flex-1 max-w-xs" />
    </div>

    <!-- Charts row -->
    <div v-if="scanSummary" class="grid gap-6 lg:grid-cols-5">
      <!-- Category scores - horizontal bars -->
      <div class="lg:col-span-3">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Category Scores
        </h2>
        <div class="rounded-lg border px-4 py-4 space-y-4">
          <div v-for="cat in categories.filter(c => c.score != null)" :key="cat.key" class="flex items-center gap-3">
            <span class="text-xs text-muted w-24 shrink-0 truncate">{{ cat.label }}</span>
            <div class="flex-1 h-5 bg-elevated rounded overflow-hidden">
              <div
                class="h-full rounded"
                :style="{ width: `${(cat.score ?? 0) * 100}%`, backgroundColor: scoreColor(cat.score) }"
              />
            </div>
            <span class="text-sm font-bold tabular-nums w-8 text-right" :style="{ color: scoreColor(cat.score) }">
              {{ categoryScoreLabel(cat) }}
            </span>
          </div>
          <div v-if="categories.every(c => c.score == null)" class="text-sm text-muted text-center py-4">
            Run routes to calculate category scores.
          </div>
        </div>
      </div>

      <!-- Donut chart -->
      <div v-if="distribution" class="lg:col-span-2">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Score Distribution
        </h2>
        <div class="rounded-lg border px-4 py-4 flex items-center gap-6 justify-center">
          <div class="relative shrink-0">
            <svg viewBox="0 0 100 100" class="size-32" aria-hidden="true" focusable="false">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ui-border)" stroke-width="10" />
              <circle
                v-for="(arc, i) in donutArcs"
                :key="i"
                cx="50" cy="50" r="40"
                fill="none"
                :stroke="arc.color"
                stroke-width="10"
                stroke-linecap="round"
                :stroke-dasharray="`${arc.dashLen} ${arc.gapLen}`"
                :transform="`rotate(${arc.rotation} 50 50)`"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="numerals-display text-2xl">{{ distribution.total }}</span>
              <span class="text-xs text-muted">routes</span>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <div v-for="seg in distribution.segments" :key="seg.label" class="flex items-center gap-2.5">
              <span class="size-2.5 rounded-full shrink-0" :style="{ backgroundColor: seg.color }" />
              <span class="text-xs text-muted w-20">{{ seg.label }}</span>
              <span class="text-sm font-semibold tabular-nums">{{ seg.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Categories — only when the scan is finished. During a live scan
         these links would lead to pages with zero data; LiveResults
         above covers the in-flight view. -->
    <section v-if="!showLiveView">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
        Categories
      </h2>
      <div class="divide-y rounded-lg border">
        <NuxtLink
          v-for="cat in categories"
          :key="cat.key"
          :to="`${scanBase}/${cat.path}`"
          class="flex items-center gap-4 px-4 py-3.5 hover:bg-elevated/50 transition-colors"
        >
          <UiIcon :name="cat.icon" class="size-4 text-muted" />
          <span class="text-sm font-medium flex-1">{{ cat.label }}</span>
          <template v-if="cat.score != null">
            <div class="w-28 h-1.5 rounded-full bg-elevated overflow-hidden hidden sm:block">
              <div
                class="h-full rounded-full"
                :style="{ width: `${cat.score * 100}%`, backgroundColor: scoreColor(cat.score) }"
              />
            </div>
            <span class="text-sm font-bold tabular-nums w-8 text-right" :style="{ color: scoreColor(cat.score) }">
              {{ categoryScoreLabel(cat) }}
            </span>
          </template>
          <span v-else class="text-sm text-muted/40">—</span>
          <UiIcon name="chevron-right" class="size-4 text-muted/50" />
        </NuxtLink>
      </div>
    </section>

    <!-- Results error / loading — error checked first so a failed results
         fetch isn't masked by the loading copy. -->
    <QueryError v-if="scanSummaryError" :error="scanSummaryError" :on-retry="refreshSummary" />
    <div v-else-if="!scanSummary && !showLiveView" class="py-12 text-center text-muted">
      <p v-if="scanIsComplete">
        Loading results...
      </p>
      <p v-else>
        Scan in progress or not found.
      </p>
    </div>
  </div>
</template>
