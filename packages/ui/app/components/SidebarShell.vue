<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

// The shared chrome for every primary layout (root / site / scan): the
// persistent AppSidebar in a fixed rail plus a sticky top bar carrying a
// contextual `#subnav` slot (breadcrumbs / tabs), the global health-pulse,
// and the theme toggle. On <lg the rail collapses into a left drawer opened
// from the top-bar menu button.
//
// Scan mode tints the whole rail blue so entering a scan is an obvious
// context shift — the rail's content fully transforms (see AppSidebar) and
// the surface washes blue here.
const colorMode = useColorMode()
const api = useApi()
const route = useRoute()

const inScan = computed(() => !!route.params.scanId && !!route.params.siteId)

// Pages that want the full content width (e.g. the wide routes table) opt in
// via `definePageMeta({ fluid: true })`. Default stays the centered max-w-7xl
// column so reading-width pages aren't stretched on ultrawide displays.
const fluid = computed(() => route.meta.fluid === true)

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// Mobile drawer — closes on navigation and when crossing back to desktop.
const navOpen = ref(false)
const isDesktop = useMediaQuery('(min-width: 1024px)')
watch(() => route.path, () => {
  navOpen.value = false
})
if (import.meta.client) {
  watch(isDesktop, (desktop) => {
    if (desktop)
      navOpen.value = false
  })
}

const railTint = computed(() => (inScan.value
  ? '[--rail-bg:color-mix(in_srgb,#3b82f6_8%,var(--ui-bg))] border-info/25'
  : 'border-default'))

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

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  checkHealth()
  timer = setInterval(checkHealth, 30000)
})
onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Desktop fixed rail -->
    <aside
      class="hidden lg:flex flex-col shrink-0 fixed top-0 bottom-0 left-0 w-64 border-r overflow-y-auto px-3 py-3 transition-colors bg-[var(--rail-bg,var(--ui-bg))]"
      :class="railTint"
    >
      <AppSidebar />
    </aside>

    <div class="flex-1 min-w-0 lg:ml-64 flex flex-col h-screen">
      <header class="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b border-default bg-default/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-default/60">
        <UiButton
          purpose="quiet"
          class="lg:hidden -ml-2 size-8 justify-center"
          aria-label="Open navigation menu"
          icon="i-lucide-menu"
          @click="navOpen = true"
        />

        <div class="flex min-w-0 flex-1 items-center">
          <slot name="subnav" />
        </div>

        <div class="ml-auto flex items-center gap-2">
          <div
            v-if="healthy !== null"
            class="flex items-center gap-1.5 text-xs"
            :class="healthy ? 'text-success' : 'text-error'"
            :title="healthy ? 'Backend connected' : 'Backend unreachable'"
          >
            <span class="relative flex size-1.5">
              <span
                class="relative inline-flex size-1.5 rounded-full"
                :class="healthy ? 'bg-success' : 'bg-error animate-pulse'"
              />
            </span>
            <span class="hidden sm:inline">{{ healthy ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <UiButton
            purpose="quiet"
            class="size-8 justify-center"
            :title="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
            @click="toggleColorMode"
          />
        </div>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="px-4 py-6" :class="fluid ? 'w-full' : 'mx-auto max-w-7xl'">
          <slot />
        </div>
      </div>
    </div>

    <!-- Mobile drawer -->
    <UDrawer v-model:open="navOpen" direction="left">
      <template #content>
        <div
          class="h-full w-72 overflow-y-auto px-3 py-3 bg-[var(--rail-bg,var(--ui-bg))]"
          :class="railTint"
        >
          <AppSidebar />
        </div>
      </template>
    </UDrawer>
  </div>
</template>
