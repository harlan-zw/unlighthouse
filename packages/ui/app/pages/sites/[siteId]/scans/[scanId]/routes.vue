<script setup lang="ts">
import ScanRoutesTable from '~/features/scan/components/ScanRoutesTable.vue'

// `fluid` lets the routes table use the full window width (SidebarShell drops
// its centered max-w-7xl column) so the data-dense table + bigger thumbnails
// have room and scroll comfortably.
definePageMeta({ layout: 'scan', fluid: true })
useScanPageTitle('Routes')
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold tracking-tight">
      Routes
    </h1>
    <ScanRoutesTable />
  </div>
</template>
