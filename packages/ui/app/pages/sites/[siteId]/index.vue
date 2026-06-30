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
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-3 min-w-0">
        <Favicon :domain="slug" :size="36" :alt="`${siteName} favicon`" class="mt-1" />
        <div class="min-w-0">
          <h1 class="text-title truncate">
            {{ siteName }}
          </h1>
          <a :href="siteUrl" target="_blank" rel="noopener" class="text-sm text-muted hover:text-default inline-flex items-center gap-1">
            {{ siteUrl }}
            <Icon name="lucide:external-link" class="size-3" />
          </a>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UiButton v-if="canCompare" purpose="secondary" size="sm" icon="i-lucide-git-compare" @click="compareLatest">
          Compare latest two
        </UiButton>
        <UiButton purpose="cta" size="sm" :to="`/scan/new?url=${encodeURIComponent(siteUrl)}`" icon="i-lucide-plus">
          New Scan
        </UiButton>
      </div>
    </div>

    <QueryError v-if="histError" :error="histError" :on-retry="refreshHistory" />

    <div v-else-if="loading" class="text-center py-16 text-muted">
      Loading site history…
    </div>

    <div v-else-if="isEmpty" class="text-center py-16 text-muted">
      <Icon name="lucide:radar" class="size-10 mx-auto mb-3 opacity-50" />
      <p>No scans yet for this site.</p>
      <UiButton purpose="cta" size="sm" class="mt-4" :to="`/scan/new?url=${encodeURIComponent(siteUrl)}`">
        Start the first scan
      </UiButton>
    </div>

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
              { value: 'mobile', label: 'Mobile', icon: 'i-lucide-smartphone' },
              { value: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor' },
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
          <h3 class="text-label text-dimmed">
            Category scores over time
          </h3>
        </template>
        <TrendChart :series="scoreSeries" :y-min="0" :y-max="100" :height="220" :markers="showReleases ? releaseMarkers : []" />
      </UiCard>

      <!-- Web vitals trend -->
      <UiCard size="sm">
        <template #header>
          <div class="flex flex-row items-center justify-between">
            <h3 class="text-label text-dimmed">
              Core Web Vitals (p75) over time
            </h3>
            <span v-if="vitalsStatus === 'pending'" class="text-xs text-muted inline-flex items-center gap-1">
              <Icon name="lucide:loader-2" class="size-3.5 animate-spin" /> loading vitals…
            </span>
          </div>
        </template>
        <div class="grid gap-6 lg:grid-cols-3">
          <div v-for="m in vitals" :key="m.key">
            <div class="text-xs font-medium mb-1" :style="{ color: m.color }">
              {{ m.label }}
            </div>
            <TrendChart
              :series="vitalsSeries(m.key, m.label, m.color)"
              :format="m.fmt"
              :show-legend="false"
              :height="140"
              :markers="showReleases ? releaseMarkers : []"
              :marker-pills="false"
            />
          </div>
        </div>
      </UiCard>

      <!-- Scan history -->
      <div>
        <h2 class="text-sm font-medium text-muted mb-3">
          Scan history
        </h2>
        <SiteHistoryTable
          :pairs="pairs"
          @open="openPair"
          @rescan="rescan"
          @delete="deleteScan"
        />
      </div>
    </template>
  </div>
</template>
