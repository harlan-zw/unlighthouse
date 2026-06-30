<script setup lang="ts">
import ScoreRing from '~/features/scan/components/ScoreRing.vue'
import { useRouteDetail } from '~/features/scan/route-detail'

definePageMeta({ layout: 'scan' })

const {
  routePath,
  status,
  scanMetaStatus,
  routeError,
  scanMetaError,
  refreshRoute,
  refreshScanMeta,
  routeData,
  rescanning,
  screenshotVisible,
  screenshotExpanded,
  deviceFilter,
  availableDevices,
  hasMultipleDevices,
  rawLhrUrl,
  lhrDownloadName,
  screenshotFullUrl,
  screenshotImageUrl,
  scores,
  metrics,
  categoryAudits,
  scoreToLabel,
  scoreToRingColor,
  formatBytes,
  formatMetric,
  metricColor,
  severityColor,
  renderMarkdownLinks,
  hasVisibleContent,
  hasNonZeroSavings,
  backToRoutes,
  rescanRoute,
} = useRouteDetail()

useScanPageTitle(computed(() => `Route ${formatTitleRoutePath(routePath)}`))
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <!-- Back to the routes list. Uses router.back() when the user
           navigated here from /routes (preserving their filter state /
           pagination) and falls back to the bare routes URL when the
           page was opened directly (deep link, share). -->
      <UiButton purpose="quiet" size="sm" icon="back" @click="backToRoutes">
        Routes
      </UiButton>
    </div>

    <QueryError v-if="scanMetaError" :error="scanMetaError" :on-retry="refreshScanMeta" />
    <QueryError v-else-if="routeError" :error="routeError" :on-retry="refreshRoute" />
    <UiLoadingState v-else-if="status === 'pending' || scanMetaStatus === 'pending'" :rows="3" />
    <UiEmptyState v-else-if="!routeData" icon="file-x" title="Route not found." compact />

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-title font-mono break-all">
            {{ routeData.route?.path }}
          </h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted">
            <UBadge color="neutral" variant="outline" size="xs">
              {{ routeData.route?.device }}
            </UBadge>
            <a :href="routeData.route?.url" target="_blank" class="flex min-h-11 items-center gap-1 hover:underline lg:min-h-0">
              {{ routeData.route?.url }}
              <UiIcon name="external" class="size-3" />
            </a>
          </div>
          <div v-if="routeData.provenance" class="flex items-center gap-3 mt-1 text-xs text-muted/60">
            <span>LH {{ routeData.provenance.lighthouseVersion }}</span>
            <span v-if="routeData.provenance.timingTotal">{{ (routeData.provenance.timingTotal / 1000).toFixed(1) }}s audit</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            v-if="routeData.route?.lhrBlobKey"
            :href="rawLhrUrl"
            :download="lhrDownloadName"
            class="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-md px-2.5 text-sm ring-1 ring-default text-default hover:bg-elevated transition-colors lg:h-8 lg:min-h-0 lg:min-w-0"
          >
            <UiIcon name="download" class="size-4" />
            Raw LHR
          </a>
          <UiButton purpose="secondary" size="sm" :loading="rescanning" icon="refresh" @click="rescanRoute">
            Rescan
          </UiButton>
        </div>
      </div>

      <!-- Device toggle — only renders when this route was audited on both
           mobile + desktop. Defaults to whichever device the backend picked
           first (empty value); explicit selection re-fetches and swaps the
           displayed scores/audits/screenshot in place. -->
      <div v-if="hasMultipleDevices" class="flex items-center gap-2">
        <span class="text-xs text-muted">View as</span>
        <UTabs
          v-model="deviceFilter"
          :content="false"
          size="sm"
          :items="availableDevices.map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1), icon: d === 'mobile' ? 'smartphone' : 'monitor' }))"
        />
      </div>

      <!-- Visual — full-page screenshot captured by the audit worker
           (core.ts:521). Endpoint 404s when no blob exists; we just
           hide the whole card so we don't show a broken image marker. -->
      <UiCard v-if="screenshotVisible" size="sm">
        <template #header>
          <div class="flex flex-row items-center justify-between gap-2">
            <h3 class="text-label text-dimmed">
              Visual
            </h3>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="inline-flex min-h-11 min-w-11 items-center gap-1 text-xs text-muted hover:text-default transition-colors lg:min-h-0 lg:min-w-0"
                @click="screenshotExpanded = !screenshotExpanded"
              >
                <UiIcon :name="screenshotExpanded ? 'chevrons-up' : 'sort'" class="size-3" />
                {{ screenshotExpanded ? 'Collapse' : 'Expand' }}
              </button>
              <a
                :href="screenshotFullUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex min-h-11 min-w-11 items-center gap-1 text-xs text-muted hover:text-default transition-colors lg:min-h-0 lg:min-w-0"
              >Open full size <UiIcon name="external" class="size-3" /></a>
            </div>
          </div>
        </template>
        <!-- Collapsed: a cropped preview of the top of the page (full-page
             captures are very tall). Expanded: the whole capture in a bounded,
             scrollable viewport so it never dominates the page. Frame width
             tracks the device — a phone column for mobile, full width for
             desktop — so neither form factor looks distorted. -->
        <div
          class="mx-auto w-full overflow-y-auto rounded border bg-elevated"
          :class="[
            screenshotExpanded ? 'max-h-[80vh]' : 'max-h-[420px]',
            routeData.route?.device === 'desktop' ? 'max-w-4xl' : 'max-w-sm',
          ]"
        >
          <img
            :src="screenshotImageUrl"
            loading="lazy"
            alt="Page screenshot"
            class="block w-full h-auto object-top"
            @error="screenshotVisible = false"
          >
        </div>
      </UiCard>

      <!-- Runtime Error -->
      <div v-if="routeData.provenance?.runtimeError" class="border border-error/30 bg-error/5 rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm font-medium text-error">
          <UiIcon name="warning" class="size-4" />
          Runtime Error: {{ routeData.provenance.runtimeError.code }}
        </div>
        <p class="text-xs text-muted mt-1">
          {{ routeData.provenance.runtimeError.message }}
        </p>
      </div>

      <!-- Warnings -->
      <div v-if="routeData.provenance?.warnings?.length" class="border border-warning/30 bg-warning/5 rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm font-medium text-warning mb-2">
          <UiIcon name="caution" class="size-4" />
          Warnings ({{ routeData.provenance.warnings.length }})
        </div>
        <ul class="text-xs text-muted space-y-1">
          <li v-for="(w, i) in routeData.provenance.warnings" :key="i">
            {{ w }}
          </li>
        </ul>
      </div>

      <!-- Category Scores -->
      <div class="grid grid-cols-2 gap-4" :class="scores.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'">
        <div v-for="s in scores" :key="s.id" class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 flex items-center gap-4">
          <ScoreRing :score="s.score" size="md" />
          <div>
            <div class="text-sm font-medium">
              {{ s.label }}
            </div>
            <div class="numerals-display text-2xl" :style="{ color: scoreToRingColor(s.score) }">
              {{ scoreToLabel(s.score) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Core Web Vitals -->
      <UiCard size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">
            Core Web Vitals &amp; Metrics
          </h3>
        </template>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          <div v-for="m in metrics" :key="m.label" class="rounded-lg border p-4 text-center">
            <div class="text-xs text-muted mb-1">
              {{ m.label }}
            </div>
            <div class="numerals-display text-xl" :class="metricColor(m.label, m.value)">
              {{ formatMetric(m.value, m.unit) }}
            </div>
            <div class="text-[10px] text-muted/60 mt-1">
              {{ m.description }}
            </div>
          </div>
        </div>
      </UiCard>

      <!-- Category Sections -->
      <template v-for="cat in categoryAudits" :key="cat.id">
        <UiCard size="sm">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-heading text-default flex items-center gap-2">
                <UiIcon :name="cat.icon" class="size-4" />
                {{ cat.label }}
              </h3>
              <div class="flex items-center gap-2">
                <UBadge v-if="cat.failing.length" color="error" variant="soft" class="text-xs">
                  {{ cat.failing.length }} failing
                </UBadge>
                <UBadge v-if="cat.passing.length" color="neutral" variant="outline" class="text-xs text-success">
                  {{ cat.passing.length }} passed
                </UBadge>
              </div>
            </div>
          </template>
          <div class="space-y-4">
            <!-- Failing audits -->
            <UAccordion v-if="cat.failing.length" :items="cat.failing.map(a => ({ ...a, value: a.id }))" type="multiple" class="w-full">
              <template #default="{ item: audit }">
                <div class="flex items-center gap-2 text-left text-sm">
                  <UBadge :color="severityColor(audit.severity)" variant="soft" class="text-[10px] w-10 justify-center shrink-0">
                    {{ audit.severity }}
                  </UBadge>
                  <span>{{ audit.title || audit.id }}</span>
                  <span v-if="audit.displayValue" class="text-muted text-xs ml-auto mr-4 shrink-0">
                    {{ audit.displayValue }}
                  </span>
                </div>
              </template>
              <template #content="{ item: audit }">
                <div class="space-y-3 pt-2 pb-2">
                  <p v-if="audit.description" class="text-xs text-muted" v-html="renderMarkdownLinks(audit.description)" />
                  <div v-if="audit.metricSavings && hasNonZeroSavings(audit.metricSavings)" class="flex gap-2 flex-wrap">
                    <template v-for="(val, key) in audit.metricSavings" :key="key">
                      <UBadge v-if="typeof val === 'number' ? val > 0 : !!val" color="neutral" variant="outline" class="text-[10px]">
                        {{ key }}: {{ typeof val === 'number' ? `${Math.round(val)}ms` : val }}
                      </UBadge>
                    </template>
                  </div>
                  <div v-if="audit.items?.filter(hasVisibleContent).length" class="border rounded-lg overflow-hidden">
                    <template v-for="(item, idx) in audit.items.slice(0, 20)" :key="idx">
                      <div v-if="hasVisibleContent(item)" class="border-b last:border-b-0 p-2 text-xs">
                        <div v-if="item.url" class="font-mono break-all text-muted">
                          {{ item.url }}
                        </div>
                        <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">
                          {{ item.node.snippet }}
                        </div>
                        <div v-if="item.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">
                          {{ item.snippet }}
                        </div>
                        <div v-if="item.node?.nodeLabel" class="text-muted mt-1">
                          {{ item.node.nodeLabel }}
                        </div>
                        <div v-if="item.reason" class="text-muted mt-1">
                          {{ item.reason }}
                        </div>
                        <div class="flex gap-2 mt-1 flex-wrap">
                          <span v-if="item.wastedBytes" class="text-warning">{{ formatBytes(item.wastedBytes) }} wasted</span>
                          <span v-if="item.wastedMs" class="text-warning">{{ Math.round(item.wastedMs) }}ms wasted</span>
                          <span v-if="item.totalBytes" class="text-muted">{{ formatBytes(item.totalBytes) }} total</span>
                          <span v-if="item.transferSize" class="text-muted">{{ formatBytes(item.transferSize) }} transferred</span>
                          <span v-if="item.blockingTime" class="text-warning">{{ Math.round(item.blockingTime) }}ms blocking</span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </UAccordion>

            <USeparator v-if="cat.failing.length && (cat.passing.length || cat.notApplicable.length)" />

            <!-- Passed audits (collapsible) -->
            <details v-if="cat.passing.length" class="group">
              <summary class="flex items-center gap-2 w-full text-sm py-1 cursor-pointer list-none">
                <UiIcon name="chevron-right" class="size-4 text-muted transition-transform group-open:rotate-90" />
                <UiIcon name="success" class="size-4 text-success" />
                <span class="text-success font-medium">Passed Audits</span>
                <UBadge color="neutral" variant="outline" class="text-[10px] text-success">
                  {{ cat.passing.length }}
                </UBadge>
              </summary>
              <UAccordion :items="cat.passing.map(a => ({ ...a, value: a.id }))" type="multiple" class="w-full mt-2">
                <template #default="{ item: audit }">
                  <div class="flex items-center gap-2 text-left text-sm">
                    <UiIcon name="check" class="size-3.5 text-success shrink-0" />
                    <span class="text-muted">{{ audit.title || audit.id }}</span>
                    <span v-if="audit.displayValue" class="text-muted/60 text-xs ml-auto mr-4 shrink-0">
                      {{ audit.displayValue }}
                    </span>
                  </div>
                </template>
                <template #content="{ item: audit }">
                  <div class="space-y-2 pt-1 pl-6 pb-2">
                    <p v-if="audit.description" class="text-xs text-muted" v-html="renderMarkdownLinks(audit.description)" />
                    <div v-if="audit.items?.filter(hasVisibleContent).length" class="border rounded-lg overflow-hidden">
                      <template v-for="(item, idx) in audit.items.slice(0, 10)" :key="idx">
                        <div v-if="hasVisibleContent(item)" class="border-b last:border-b-0 p-2 text-xs">
                          <div v-if="item.url" class="font-mono break-all text-muted">
                            {{ item.url }}
                          </div>
                          <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">
                            {{ item.node.snippet }}
                          </div>
                          <div v-if="item.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">
                            {{ item.snippet }}
                          </div>
                          <div class="flex gap-2 mt-1 flex-wrap">
                            <span v-if="item.totalBytes" class="text-muted">{{ formatBytes(item.totalBytes) }}</span>
                            <span v-if="item.transferSize" class="text-muted">{{ formatBytes(item.transferSize) }} transferred</span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>
              </UAccordion>
            </details>

            <!-- Not Applicable (collapsible) -->
            <details v-if="cat.notApplicable.length" class="group">
              <summary class="flex items-center gap-2 w-full text-sm py-1 cursor-pointer list-none">
                <UiIcon name="chevron-right" class="size-4 text-muted transition-transform group-open:rotate-90" />
                <UiIcon name="minus" class="size-4 text-muted" />
                <span class="text-muted">Not Applicable</span>
                <UBadge color="neutral" variant="outline" class="text-[10px]">
                  {{ cat.notApplicable.length }}
                </UBadge>
              </summary>
              <div class="space-y-0.5 pt-2 pl-6">
                <div v-for="audit in cat.notApplicable" :key="audit.id" class="flex items-center gap-2 py-1 text-sm text-muted/60">
                  <UiIcon name="minus" class="size-3 shrink-0" />
                  <span>{{ audit.title || audit.id }}</span>
                </div>
              </div>
            </details>
          </div>
        </UiCard>
      </template>

      <!-- Stack Packs -->
      <UiCard v-if="routeData.stackPacks?.length" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">
            Framework Recommendations
          </h3>
        </template>
        <div v-for="pack in routeData.stackPacks" :key="pack.id" class="mb-4 last:mb-0">
          <div class="text-sm font-medium mb-1">
            {{ pack.title }}
          </div>
          <div v-for="(desc, auditId) in pack.descriptions" :key="auditId" class="text-xs text-muted ml-4 mb-1">
            <span class="font-mono text-primary/80">{{ auditId }}</span>: {{ desc }}
          </div>
        </div>
      </UiCard>

      <!-- Entities -->
      <UiCard v-if="routeData.entities?.length" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">
            Third-Party Entities
          </h3>
        </template>
        <div class="flex flex-wrap gap-2">
          <UBadge v-for="entity in routeData.entities" :key="entity.name" :color="entity.isFirstParty ? 'primary' : 'neutral'" :variant="entity.isFirstParty ? 'solid' : 'outline'" class="text-xs">
            {{ entity.name }}
          </UBadge>
        </div>
      </UiCard>
    </template>
  </div>
</template>
