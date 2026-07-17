<script setup lang="ts">
// Dedicated full-bleed layout for the compare experience. No max-width
// main, no global header — the page draws its own slim toolbar with
// scan identity + actions so the entire viewport is usable for the
// route diff table + per-route detail. Health pulse stays so the
// "backend down" cue still reaches you from inside compare.

const route = useRoute()
const colorMode = useColorMode()

// Site comes straight off the route param (/sites/{siteId}/compare) — no
// scan-meta lookup needed, unlike the old /compare/{scanId} shim which had
// to resolve the site indirectly.
const siteId = computed(() => (route.params.siteId as string) || '')

const { data: sitesData } = useApiQuery('sites.list', () => ({}))
const siteName = computed(() => {
  const slug = siteId.value
  if (!slug)
    return ''
  return (sitesData.value?.sites ?? []).find(s => siteSlug(s.url) === slug)?.name || slug
})

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const { healthy } = useBackendHealth()
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-default text-default">
    <a
      href="#main-content"
      class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-default focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:ring-2 focus-visible:ring-primary"
    >Skip to content</a>
    <!-- Slim top strip; the page itself owns the in-flow toolbar
         underneath (scan picker / swap / threshold etc). Keep this
         strip absolutely minimal so we don't burn vertical space. -->
    <div class="flex items-center gap-2 px-3 h-9 border-b text-xs">
      <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 min-w-0">
        <NuxtLink to="/" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors shrink-0 lg:min-h-6 lg:min-w-6">
          Sites
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <NuxtLink :to="`/sites/${siteId}`" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors truncate lg:min-h-6 lg:min-w-6">
          {{ siteName }}
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <span class="font-medium truncate">Compare scans</span>
      </nav>

      <div
        v-if="healthy !== null"
        class="flex items-center gap-1 ml-2"
        :class="healthy ? 'text-success' : 'text-error'"
        role="status"
        aria-live="polite"
      >
        <span class="size-1.5 rounded-full" :class="healthy ? 'bg-success' : 'bg-error motion-safe:animate-pulse'" aria-hidden="true" />
        <span>{{ healthy ? 'Connected' : 'Disconnected' }}</span>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <UiButton
          purpose="quiet"
          size="xs"
          class="size-7 justify-center"
          :aria-label="`Switch to ${colorMode.value === 'dark' ? 'light' : 'dark'} mode`"
          :icon="colorMode.value === 'dark' ? 'light' : 'dark'"
          @click="toggleColorMode"
        />
      </div>
    </div>

    <main id="main-content" tabindex="-1" class="flex-1 overflow-hidden">
      <slot />
    </main>
  </div>
</template>
