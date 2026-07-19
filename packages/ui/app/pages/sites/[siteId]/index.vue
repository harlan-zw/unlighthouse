<script setup lang="ts">
import SiteHistoryTable from '~/features/sites/components/SiteHistoryTable.vue'
import TrendChart from '~/features/sites/components/TrendChart.vue'
import { useSiteOverview } from '~/features/sites/overview'

definePageMeta({ layout: 'site' })

const {
  slug,
  siteUrl,
  siteName,
  hasBoth,
  deviceFilter,
  showReleases,
  releaseMarkers,
  hasReleases,
  scoreSeries,
  vitalsStatus,
  vitals,
  vitalsSeries,
  pairs,
  openPair,
  rescan,
  deleteScan,
  canCompare,
  compareLatest,
  loading,
  isEmpty,
  histError,
  refreshHistory,
} = useSiteOverview()

usePageTitle(computed(() => `Site Overview - ${formatTitleSite(siteName.value)}`))
const isStatic = useIsStatic()
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-3 min-w-0">
        <UiFavicon :domain="slug" :size="36" :alt="`${siteName} favicon`" class="mt-1" />
        <div class="min-w-0">
          <h1 class="text-title truncate">
            {{ siteName }}
          </h1>
          <a :href="siteUrl" target="_blank" rel="noopener noreferrer" class="text-sm text-muted hover:text-default inline-flex items-center gap-1">
            {{ siteUrl }}
            <UiIcon name="external" class="size-3" />
          </a>
        </div>
      </div>
      <div v-if="!isStatic" class="flex items-center gap-2">
        <UiButton v-if="canCompare" purpose="secondary" size="sm" icon="compare" @click="compareLatest">
          Compare latest two
        </UiButton>
        <UiButton purpose="cta" size="sm" :to="`/scan/new?url=${encodeURIComponent(siteUrl)}`" icon="add">
          Run scan
        </UiButton>
      </div>
    </div>

    <QueryError v-if="histError" :error="histError" :on-retry="refreshHistory" />

    <UiLoadingState v-else-if="loading" :rows="3" />

    <UiEmptyState v-else-if="isEmpty" icon="radar" :title="isStatic ? 'No scans were included for this site.' : 'Run a scan to build this site\'s history.'">
      <UiButton v-if="!isStatic" purpose="cta" size="sm" :to="`/scan/new?url=${encodeURIComponent(siteUrl)}`">
        Run first scan
      </UiButton>
    </UiEmptyState>

    <template v-else>
      <!-- Trend controls -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div v-if="hasBoth" class="flex items-center gap-2">
          <span class="text-xs text-muted">Trends for</span>
          <UTabs
            v-model="deviceFilter"
            :content="false"
            size="sm"
            :items="[
              { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
              { value: 'desktop', label: 'Desktop', icon: 'monitor' },
            ]"
          />
        </div>
        <div v-else />
        <USwitch
          v-if="hasReleases"
          :model-value="showReleases"
          label="Show releases"
          @update:model-value="(v: boolean) => showReleases = v"
        />
      </div>

      <!-- Score trend -->
      <UiCard size="sm">
        <template #header>
          <h2 class="text-label text-muted">
            Category scores over time
          </h2>
        </template>
        <TrendChart label="Category scores over time" :series="scoreSeries" :y-min="0" :y-max="100" :height="220" :markers="showReleases ? releaseMarkers : []" />
      </UiCard>

      <!-- Web vitals trend -->
      <UiCard size="sm">
        <template #header>
          <div class="flex flex-row items-center justify-between">
            <h2 class="text-label text-muted">
              Core Web Vitals (p75) over time
            </h2>
            <span v-if="vitalsStatus === 'pending'" class="text-xs text-muted inline-flex items-center gap-1">
              <UiIcon name="loading" class="size-3.5 animate-spin" /> loading vitals…
            </span>
          </div>
        </template>
        <div class="grid gap-6 lg:grid-cols-3">
          <div v-for="m in vitals" :key="m.key">
            <div class="flex items-center gap-1.5 text-xs font-medium text-default mb-1">
              <span class="size-2 rounded-full shrink-0" :style="{ backgroundColor: m.color }" aria-hidden="true" />
              {{ m.label }}
            </div>
            <TrendChart
              :series="vitalsSeries(m.key, m.label, m.color)"
              :label="`${m.label} over time`"
              :format="m.fmt"
              :show-legend="false"
              :height="140"
              :markers="showReleases ? releaseMarkers : []"
              :marker-pills="false"
            />
          </div>
        </div>
      </UiCard>

      <!-- Scans -->
      <div>
        <h2 class="text-sm font-medium text-muted mb-3">
          Scans
        </h2>
        <SiteHistoryTable
          :pairs="pairs"
          :readonly="isStatic"
          @open="openPair"
          @rescan="rescan"
          @delete="deleteScan"
        />
      </div>
    </template>
  </div>
</template>
