<script setup lang="ts">
// Dedicated full-bleed layout for the compare experience. No max-width
// main, no global header — the page draws its own slim toolbar with
// scan identity + actions so the entire viewport is usable for the
// route diff table + per-route detail. Health pulse stays so the
// "backend down" cue still reaches you from inside compare.

const route = useRoute()
const colorMode = useColorMode()
const api = useApi()

// Pick up the current scan id from the route param so "Exit compare"
// returns to that scan's overview — that's where the user came from
// (the compare button on the overview tools list). Previously the
// link went to /history, which felt jarring as a "back" action.
const currentScanId = computed(() => (route.params.id as string) || '')

// Resolve the scan's site so "Exit compare" lands directly on the new
// /sites/{slug}/scans/{id} overview rather than bouncing through the
// legacy /scan/{id} redirect shim.
const { data: exitMeta } = useAsyncData(
  'compare-exit-meta',
  () => currentScanId.value ? api['scan.meta']({ scanId: currentScanId.value as any }).catch(() => null) : Promise.resolve(null),
  { watch: [currentScanId] },
)
const exitTo = computed(() => {
  const site = exitMeta.value?.site
  if (currentScanId.value && site) {
    try {
      return `/sites/${new URL(site).hostname}/scans/${currentScanId.value}/routes`
    }
    catch {}
  }
  return currentScanId.value ? `/scan/${currentScanId.value}/routes` : '/history'
})

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const healthy = ref<boolean | null>(null)
async function checkHealth() {
  try {
    await api['health']({})
    healthy.value = true
  }
  catch {
    healthy.value = false
  }
}
if (import.meta.client) {
  checkHealth()
  setInterval(checkHealth, 30000)
}
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Slim top strip; the page itself owns the in-flow toolbar
         underneath (scan picker / swap / threshold etc). Keep this
         strip absolutely minimal so we don't burn vertical space. -->
    <div class="flex items-center gap-2 px-3 h-9 border-b text-xs">
      <NuxtLink :to="exitTo" class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
        <Icon name="lucide:arrow-left" class="size-3.5" />
        <span>Exit compare</span>
      </NuxtLink>

      <div
        v-if="healthy !== null"
        class="flex items-center gap-1 ml-2"
        :class="healthy ? 'text-green-500' : 'text-red-500'"
        :title="healthy ? 'Backend connected' : 'Backend unreachable'"
      >
        <span class="size-1.5 rounded-full" :class="healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'" />
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button
          class="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          :title="`Switch to ${colorMode.value === 'dark' ? 'light' : 'dark'} mode`"
          @click="toggleColorMode"
        >
          <Icon :name="colorMode.value === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="size-3.5" />
        </button>
      </div>
    </div>

    <main class="flex-1 overflow-hidden">
      <slot />
    </main>
  </div>
</template>
