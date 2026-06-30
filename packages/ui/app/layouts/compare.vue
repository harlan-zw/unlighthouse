<script setup lang="ts">
import type { ScanId } from '@unlighthouse/contracts'

// Dedicated full-bleed layout for the compare experience. No max-width
// main, no global header — the page draws its own slim toolbar with
// scan identity + actions so the entire viewport is usable for the
// route diff table + per-route detail. Health pulse stays so the
// "backend down" cue still reaches you from inside compare.

const route = useRoute()
const colorMode = useColorMode()

// Pick up the current scan id from the route param so "Exit compare"
// returns to that scan's overview — that's where the user came from
// (the compare button on the overview tools list). Previously the
// link went to /history, which felt jarring as a "back" action.
const currentScanId = computed(() => ((route.params.id as string) || '') as ScanId | '')

// Resolve the scan's site so "Exit compare" lands directly on the new
// /sites/{slug}/scans/{id} overview rather than bouncing through the
// legacy /scan/{id} redirect shim.
// Best-effort: only feeds the "Exit compare" link target, so a failure just
// falls back to the legacy /scan path — no error surface needed.
const { data: exitMeta } = useApiQuery(
  'scan.meta',
  () => ({ scanId: currentScanId.value as ScanId }),
  { enabled: () => !!currentScanId.value },
)
const exitTo = computed(() => {
  const site = exitMeta.value?.site
  if (currentScanId.value && site)
    return `/sites/${siteSlug(site)}/scans/${currentScanId.value}/routes`
  return currentScanId.value ? `/scan/${currentScanId.value}/routes` : '/history'
})

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const { healthy } = useBackendHealth()
</script>

<template>
  <div class="h-screen flex flex-col bg-default text-default overflow-hidden">
    <!-- Slim top strip; the page itself owns the in-flow toolbar
         underneath (scan picker / swap / threshold etc). Keep this
         strip absolutely minimal so we don't burn vertical space. -->
    <div class="flex items-center gap-2 px-3 h-9 border-b text-xs">
      <NuxtLink :to="exitTo" class="inline-flex min-h-11 min-w-11 items-center gap-1 text-muted hover:text-default transition-colors lg:min-h-0 lg:min-w-0">
        <UiIcon name="back" class="size-3.5" />
        <span>Exit compare</span>
      </NuxtLink>

      <div
        v-if="healthy !== null"
        class="flex items-center gap-1 ml-2"
        :class="healthy ? 'text-success' : 'text-error'"
        :title="healthy ? 'Backend connected' : 'Backend unreachable'"
      >
        <span class="size-1.5 rounded-full" :class="healthy ? 'bg-success' : 'bg-error animate-pulse'" />
      </div>

      <div class="ml-auto flex items-center gap-1">
        <UiButton
          purpose="quiet"
          size="xs"
          class="size-7 justify-center"
          :title="`Switch to ${colorMode.value === 'dark' ? 'light' : 'dark'} mode`"
          :icon="colorMode.value === 'dark' ? 'light' : 'dark'"
          @click="toggleColorMode"
        />
      </div>
    </div>

    <main class="flex-1 overflow-hidden">
      <slot />
    </main>
  </div>
</template>
