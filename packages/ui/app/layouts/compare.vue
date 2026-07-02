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
  <div class="h-screen flex flex-col bg-default text-default overflow-hidden">
    <!-- Slim top strip; the page itself owns the in-flow toolbar
         underneath (scan picker / swap / threshold etc). Keep this
         strip absolutely minimal so we don't burn vertical space. -->
    <div class="flex items-center gap-2 px-3 h-9 border-b text-xs">
      <nav class="flex items-center gap-1.5 min-w-0">
        <NuxtLink to="/" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors shrink-0 lg:min-h-0 lg:min-w-0">
          Sites
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <NuxtLink :to="`/sites/${siteId}`" class="inline-flex min-h-11 min-w-11 items-center px-1 -mx-1 text-muted hover:text-default transition-colors truncate lg:min-h-0 lg:min-w-0">
          {{ siteName }}
        </NuxtLink>
        <UiIcon name="chevron-right" class="size-3.5 text-muted shrink-0" />
        <span class="font-medium truncate">Compare</span>
      </nav>

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
