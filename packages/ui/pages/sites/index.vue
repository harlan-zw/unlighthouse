<script setup lang="ts">
// Multi-site dashboard — derived from every persisted scan rather than the
// curated `sites.*` registry. Hosts that received scans via explicit `site`
// overrides (see #345) surface here even if the URL was never registered.
//
// closes #227 / phase 17.

import { useScannedSites } from '~/composables/useScannedSites'
import { useSites } from '~/composables/sites'

definePageMeta({ layout: 'dashboard' })

const { scannedSites, pending } = useScannedSites()
const { sites: registeredSites } = useSites()

const ungrouped = computed(() => scannedSites.value)
const registeredCount = computed(() => scannedSites.value.filter(s => s.registry).length)
const adHocCount = computed(() => scannedSites.value.length - registeredCount.value)
</script>

<template>
  <div>
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">
          Tracked sites
        </h1>
        <p class="text-sm text-muted mt-1">
          <span v-if="pending">Loading scan history…</span>
          <span v-else-if="scannedSites.length === 0">
            No scans yet — sites the host has scanned will appear here.
          </span>
          <span v-else>
            {{ scannedSites.length }} site{{ scannedSites.length === 1 ? '' : 's' }} with scans
            <template v-if="adHocCount > 0">
              · {{ adHocCount }} ad-hoc
            </template>
            · {{ registeredSites.length }} registered
          </span>
        </p>
      </div>
      <UiMotionButton to="/sites/add" icon="i-heroicons-plus" color="primary">
        Add site
      </UiMotionButton>
    </header>

    <div v-if="pending && !scannedSites.length" class="text-sm text-dimmed">
      Loading…
    </div>

    <div v-else-if="scannedSites.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <ScannedSiteCard v-for="site in ungrouped" :key="site.url" :site="site" />
    </div>

    <div v-else class="rounded-sm ring-1 ring-default bg-elevated/40 px-6 py-16 text-center max-w-2xl mx-auto">
      <div class="size-12 rounded-sm ring-1 ring-default bg-elevated/60 mx-auto mb-6 flex items-center justify-center">
        <UIcon name="i-heroicons-globe-alt" class="size-6 text-highlighted" />
      </div>
      <h2 class="text-lg font-semibold mb-2">
        No scans yet
      </h2>
      <p class="text-muted mb-6">
        Register a site or run a scan to start building history.
      </p>
      <div class="flex justify-center gap-3">
        <UiMotionButton to="/sites/add" icon="i-heroicons-plus" color="primary">
          Add a site
        </UiMotionButton>
        <UiMotionButton to="/" variant="outline" color="neutral">
          Back to dashboard
        </UiMotionButton>
      </div>
    </div>
  </div>
</template>
